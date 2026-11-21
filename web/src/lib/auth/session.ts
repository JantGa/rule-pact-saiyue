import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Address } from "@/lib/domain/types";
import type { Store } from "@/lib/db/store";

export const SESSION_COOKIE = "rulepact_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error("生产环境必须设置 SESSION_SECRET");
  }
  return value || "fairplay-local-development-secret-change-me";
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function normalizeAddress(address: string): Address {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) throw new Error("钱包地址格式不正确");
  return address.toLowerCase() as Address;
}

export function createSessionToken(address: Address, now = Date.now()) {
  const payload = Buffer.from(
    JSON.stringify({ address, exp: now + SESSION_TTL_MS, nonce: randomBytes(9).toString("hex") })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token: string | undefined, now = Date.now()): Address | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      address: string;
      exp: number;
    };
    if (parsed.exp <= now) return null;
    return normalizeAddress(parsed.address);
  } catch {
    return null;
  }
}

export function createChallenge(address: Address, now = Date.now()) {
  const nonce = randomBytes(18).toString("hex");
  const issuedAt = new Date(now).toISOString();
  const message = [
    "Rule pact 赛约",
    "使用钱包登录并授权身份识别。",
    "",
    `钱包：${address}`,
    `一次性口令：${nonce}`,
    `签发时间：${issuedAt}`,
    "",
    "此签名不会发起链上交易。"
  ].join("\n");
  return {
    address,
    nonce,
    message,
    expiresAt: new Date(now + CHALLENGE_TTL_MS).toISOString()
  };
}

export async function issueChallenge(store: Store, addressInput: string) {
  const address = normalizeAddress(addressInput);
  const challenge = createChallenge(address);
  await store.update((state) => {
    const now = Date.now();
    for (const [key, existing] of Object.entries(state.challenges)) {
      if (new Date(existing.expiresAt).getTime() <= now) delete state.challenges[key];
    }
    state.challenges[address] = challenge;
  });
  return challenge;
}

export async function consumeChallenge(store: Store, addressInput: string) {
  const address = normalizeAddress(addressInput);
  return store.update((state) => {
    const challenge = state.challenges[address];
    if (!challenge) throw new Error("请重新获取登录口令");
    if (new Date(challenge.expiresAt).getTime() <= Date.now()) {
      delete state.challenges[address];
      throw new Error("登录口令已过期");
    }
    delete state.challenges[address];
    return challenge;
  });
}

