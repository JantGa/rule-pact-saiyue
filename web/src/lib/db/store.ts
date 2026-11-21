import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DbState } from "@/lib/domain/types";

const EMPTY_STATE: DbState = {
  challenges: {},
  competitions: {},
  invites: {}
};

export interface Store {
  read(): Promise<DbState>;
  update<T>(mutator: (state: DbState) => T | Promise<T>): Promise<T>;
}

const stores = new Map<string, JsonStore>();

export class JsonStore implements Store {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async read(): Promise<DbState> {
    try {
      return JSON.parse(await readFile(this.filePath, "utf8")) as DbState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return structuredClone(EMPTY_STATE);
      }
      throw error;
    }
  }

  async update<T>(mutator: (state: DbState) => T | Promise<T>): Promise<T> {
    let resolveResult: (value: T | PromiseLike<T>) => void;
    let rejectResult: (reason?: unknown) => void;
    const result = new Promise<T>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });

    this.queue = this.queue
      .catch(() => undefined)
      .then(async () => {
        try {
          const state = await this.read();
          const next = await mutator(state);
          await mkdir(path.dirname(this.filePath), { recursive: true });
          const tempPath = `${this.filePath}.${process.pid}.tmp`;
          await writeFile(tempPath, JSON.stringify(state, null, 2), { mode: 0o600 });
          await rename(tempPath, this.filePath);
          resolveResult(next);
        } catch (error) {
          rejectResult(error);
        }
      });
    return result;
  }
}

export function getStore(): Store {
  const dataDir = process.env.FAIRPLAY_DATA_DIR || ".data";
  const filePath = path.isAbsolute(dataDir)
    ? path.join(dataDir, "fairplay.json")
    : path.join(process.cwd(), dataDir, "fairplay.json");
  let store = stores.get(filePath);
  if (!store) {
    store = new JsonStore(filePath);
    stores.set(filePath, store);
  }
  return store;
}

export class MemoryStore implements Store {
  private state: DbState;

  constructor(seed: Partial<DbState> = {}) {
    this.state = {
      ...structuredClone(EMPTY_STATE),
      ...structuredClone(seed)
    };
  }

  async read(): Promise<DbState> {
    return structuredClone(this.state);
  }

  async update<T>(mutator: (state: DbState) => T | Promise<T>): Promise<T> {
    const next = structuredClone(this.state);
    const result = await mutator(next);
    this.state = next;
    return structuredClone(result);
  }
}

