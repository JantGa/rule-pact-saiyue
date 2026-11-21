import { describe, expect, it } from "vitest";
import {
  createChallenge,
  createSessionToken,
  normalizeAddress,
  readSessionToken
} from "./session";

const address = "0xAbCd00000000000000000000000000000000Ef12";

describe("wallet identity", () => {
  it("normalizes and validates wallet addresses", () => {
    expect(normalizeAddress(address)).toBe(address.toLowerCase());
    expect(() => normalizeAddress("0x123")).toThrow("格式不正确");
  });

  it("creates a one-time human-readable challenge", () => {
    const now = Date.UTC(2026, 10, 21);
    const challenge = createChallenge(normalizeAddress(address), now);
    expect(challenge.message).toContain("Rule pact 赛约");
    expect(challenge.message).toContain(challenge.nonce);
    expect(challenge.message).toContain("不会发起链上交易");
    expect(new Date(challenge.expiresAt).getTime()).toBeGreaterThan(now);
  });

  it("signs sessions and rejects tampering and expiry", () => {
    const now = Date.UTC(2026, 10, 21);
    const token = createSessionToken(normalizeAddress(address), now);
    expect(readSessionToken(token, now + 1_000)).toBe(address.toLowerCase());
    expect(readSessionToken(`${token}tampered`, now + 1_000)).toBeNull();
    expect(readSessionToken(token, now + 8 * 24 * 60 * 60 * 1000)).toBeNull();
  });
});

