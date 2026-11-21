import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch, shortAddress, statusLabel } from "./ui";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("frontend display helpers", () => {
  it("shortens wallet addresses consistently", () => {
    expect(shortAddress("0x1234567890abcdef1234567890abcdef12345678")).toBe("0x12345…45678");
    expect(shortAddress("0x1234567890abcdef1234567890abcdef12345678", 4)).toBe("0x1234…5678");
  });

  it("maps every competition state to a Chinese label", () => {
    expect(statusLabel("inviting")).toBe("等待队友");
    expect(statusLabel("ready")).toBe("等待开局");
    expect(statusLabel("active")).toBe("比赛进行中");
    expect(statusLabel("completed")).toBe("已结束");
  });

  it("explains network failures instead of surfacing raw failed to fetch", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(apiFetch("/api/rules/generate", { method: "POST" })).rejects.toThrow(
      "无法连接 Rule pact 服务端"
    );
  });

  it("detects an HTML 404 from a different local project", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<!doctype html><title>404</title>", {
          status: 404,
          headers: { "Content-Type": "text/html" }
        })
      )
    );
    await expect(apiFetch("/api/rules/generate")).rejects.toThrow(
      "没有连接当前 Rule pact 服务"
    );
  });
});
