import { keccak256, stringToHex } from "viem";

export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)])
    );
  }
  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function hashArtifact(value: unknown): `0x${string}` {
  return keccak256(stringToHex(stableStringify(value)));
}

