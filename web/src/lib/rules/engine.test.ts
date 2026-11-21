import { describe, expect, it } from "vitest";
import { generateRuleDraft } from "./generator";
import { hashArtifact, stableStringify } from "./hash";
import { judgeRound, validatePayload } from "./engine";
import { validateRuleSpec, type RuleSpec } from "./schema";

const alice = "0x1111111111111111111111111111111111111111" as const;
const bob = "0x2222222222222222222222222222222222222222" as const;

describe("rule compiler", () => {
  it("compiles a description into a valid, deterministic rule spec", () => {
    const spec = generateRuleDraft({
      description: "两人进行三局两胜的桌上足球比赛，记录胜负和进球数。",
      maxRounds: 3,
      players: 2
    });

    expect(validateRuleSpec(spec)).toEqual(spec);
    expect(spec.playerCount).toEqual({ min: 2, max: 2 });
    expect(spec.maxRounds).toBe(3);
    expect(spec.endConditions[0].when).toEqual({
      field: "won.sum",
      op: "gte",
      value: 2
    });
  });

  it("rejects rules that refer to undeclared fields", () => {
    const spec = generateRuleDraft({
      description: "测试一个引用不存在字段的比赛规则。",
      maxRounds: 2,
      players: 2
    });
    const invalid = structuredClone(spec) as RuleSpec;
    invalid.scoring[0].when = { field: "ghost", op: "eq", value: 1 };
    expect(() => validateRuleSpec(invalid)).toThrow("计分规则只能引用本局输入字段");

    const invalidEnd = structuredClone(spec);
    invalidEnd.endConditions[0].when = { field: "won", op: "eq", value: true };
    expect(() => validateRuleSpec(invalidEnd)).toThrow("结束条件必须引用聚合字段");
  });

  it("validates and coerces submitted round data", () => {
    const spec = generateRuleDraft({
      description: "测试比赛数据的类型、范围和必填字段。",
      maxRounds: 2,
      players: 2
    });
    expect(validatePayload(spec, { won: "true", score: "12" })).toEqual({
      won: true,
      score: 12
    });
    expect(() => validatePayload(spec, { won: true, score: -1 })).toThrow("不能小于");
  });
});

describe("deterministic referee", () => {
  const spec = generateRuleDraft({
    description: "两人三局两胜，记录每局胜负和得分。",
    maxRounds: 3,
    players: 2
  });

  it("scores a round and ends when a player reaches two wins", () => {
    const first = judgeRound({
      spec,
      roundIndex: 1,
      players: [alice, bob],
      submissions: [
        { participant: alice, data: { won: true, score: 5 } },
        { participant: bob, data: { won: false, score: 3 } }
      ]
    });
    expect(first.complete).toBe(false);
    expect(first.aggregates[alice]).toBe(1);

    const second = judgeRound({
      spec,
      roundIndex: 2,
      players: [alice, bob],
      submissions: [
        { participant: alice, data: { won: true, score: 4 } },
        { participant: bob, data: { won: false, score: 2 } }
      ],
      priorPoints: first.aggregates,
      priorSubmissions: {
        [alice]: [{ participant: alice, data: { won: true, score: 5 } }],
        [bob]: [{ participant: bob, data: { won: false, score: 3 } }]
      }
    });

    expect(second.complete).toBe(true);
    expect(second.endedBy).toContain("赢得 2 局");
    expect(second.winners).toEqual([alice]);
    expect(second.tie).toBe(false);
  });

  it("supports lowest-value winners", () => {
    const race: RuleSpec = {
      version: 1,
      title: "计时赛",
      description: "一轮计时赛，用时最低的人获胜。",
      playerCount: { min: 2, max: 4 },
      maxRounds: 1,
      inputFields: [
        {
          key: "seconds",
          label: "用时",
          type: "number",
          description: "完成比赛所用秒数",
          required: true,
          min: 0
        }
      ],
      scoring: [],
      endConditions: [],
      winner: { metric: "seconds", aggregation: "latest", direction: "lowest" },
      tieBreakers: [],
      explanation: "完成同一条赛道后，用时更短者获胜。",
      summary: ["单轮计时", "用时最低者获胜"]
    };
    const judged = judgeRound({
      spec: race,
      roundIndex: 1,
      players: [alice, bob],
      submissions: [
        { participant: alice, data: { seconds: 32.4 } },
        { participant: bob, data: { seconds: 30.1 } }
      ]
    });
    expect(judged.complete).toBe(true);
    expect(judged.winners).toEqual([bob]);
  });

  it("detects a genuine tie after every tie breaker", () => {
    const judged = judgeRound({
      spec,
      roundIndex: 3,
      players: [alice, bob],
      submissions: [
        { participant: alice, data: { won: false, score: 8 } },
        { participant: bob, data: { won: false, score: 8 } }
      ],
      priorPoints: { [alice]: 1, [bob]: 1 },
      priorSubmissions: {
        [alice]: [
          { participant: alice, data: { won: true, score: 8 } },
          { participant: alice, data: { won: false, score: 8 } }
        ],
        [bob]: [
          { participant: bob, data: { won: true, score: 8 } },
          { participant: bob, data: { won: false, score: 8 } }
        ]
      }
    });
    expect(judged.complete).toBe(true);
    expect(judged.tie).toBe(true);
    expect(judged.winners).toHaveLength(2);
  });

  it("rejects duplicate or incomplete participant submissions", () => {
    expect(() =>
      judgeRound({
        spec,
        roundIndex: 1,
        players: [alice, bob],
        submissions: [{ participant: alice, data: { won: true, score: 1 } }]
      })
    ).toThrow("尚未完整收齐");

    expect(() =>
      judgeRound({
        spec,
        roundIndex: 1,
        players: [alice, bob],
        submissions: [
          { participant: alice, data: { won: true, score: 1 } },
          { participant: alice, data: { won: false, score: 1 } }
        ]
      })
    ).toThrow("重复提交");
  });
});

describe("canonical evidence hashing", () => {
  it("is stable across object key order", () => {
    const left = { b: 2, a: { d: 4, c: 3 } };
    const right = { a: { c: 3, d: 4 }, b: 2 };
    expect(stableStringify(left)).toBe(stableStringify(right));
    expect(hashArtifact(left)).toBe(hashArtifact(right));
    expect(hashArtifact(left)).toMatch(/^0x[a-f0-9]{64}$/);
  });
});

