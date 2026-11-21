import { afterEach, describe, expect, it, vi } from "vitest";
import { generateRuleDraft, generateRules } from "./generator";

const input = {
  description: "两名选手进行计时赛，用时更短者获胜。",
  maxRounds: 1,
  players: 2
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AI rule generation", () => {
  it("passes the page-supplied key and model only to the AI request", async () => {
    const aiSpec = generateRuleDraft(input);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(aiSpec) } }]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateRules({
      ...input,
      apiKey: "sk-page-only-test-key",
      model: "gpt-test-mini"
    });

    expect(result.source).toBe("ai");
    expect(result.spec.title).toBe(aiSpec.title);
    expect(JSON.stringify(result)).not.toContain("sk-page-only-test-key");
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect((request.headers as Record<string, string>).Authorization).toBe(
      "Bearer sk-page-only-test-key"
    );
    expect(JSON.parse(String(request.body)).model).toBe("gpt-test-mini");
  });

  it("falls back with a visible warning when the AI provider fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "upstream unavailable" }), {
          status: 503,
          headers: { "Content-Type": "application/json" }
        })
      )
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await generateRules({ ...input, apiKey: "sk-invalid" });

    expect(result.source).toBe("builtin");
    expect(result.warning).toContain("本地确定性编译器");
    expect(result.spec.playerCount.max).toBe(2);
  });
});

