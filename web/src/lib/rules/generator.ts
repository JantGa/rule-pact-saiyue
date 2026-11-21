import type { RuleSpec } from "./schema";
import { validateRuleSpec } from "./schema";

export type RuleGenerationInput = {
  description: string;
  maxRounds: number;
  players: number;
  apiKey?: string;
  model?: string;
};

function cleanTitle(description: string) {
  const firstSentence = description.split(/[。！？.!?\n]/)[0]?.trim();
  if (!firstSentence) return "自定比赛";
  return firstSentence.length > 32 ? `${firstSentence.slice(0, 32)}…` : firstSentence;
}

export function generateRuleDraft(input: RuleGenerationInput): RuleSpec {
  const target = Math.max(1, Math.floor(input.maxRounds / 2 + 1));
  const draft: RuleSpec = {
    version: 1,
    title: cleanTitle(input.description),
    description: input.description.trim(),
    playerCount: { min: 2, max: Math.max(2, input.players) },
    maxRounds: input.maxRounds,
    inputFields: [
      {
        key: "won",
        label: "本局获胜",
        type: "boolean",
        description: "裁判或双方确认的每局胜负结果",
        required: true
      },
      {
        key: "score",
        label: "本局得分",
        type: "number",
        description: "本局获得的原始分数，用于同分时排序",
        required: true,
        min: 0,
        max: 100000
      }
    ],
    scoring: [
      {
        id: "round-win",
        label: "单局获胜",
        points: 1,
        when: { field: "won", op: "eq", value: true }
      }
    ],
    endConditions: [
      {
        label: `任一方累计赢得 ${target} 局`,
        scope: "any",
        when: { field: "won.sum", op: "gte", value: target }
      }
    ],
    winner: {
      metric: "points",
      aggregation: "sum",
      direction: "highest"
    },
    tieBreakers: [
      { metric: "score.sum", aggregation: "sum", direction: "highest" }
    ],
    explanation: `每局参与者提交“是否获胜”和“本局得分”。获胜一局计 1 分；累计先达到 ${target} 个胜局，或完成 ${input.maxRounds} 局后结束。总分最高者获胜，总分相同时比较全程原始得分之和。`,
    summary: [
      `支持 ${input.players} 名参与者，最多进行 ${input.maxRounds} 局`,
      "每局每人只能提交一次，全部提交后才自动判分",
      `任一参与者累计获胜 ${target} 局时提前结束`,
      "总分最高者胜；同分时比较原始得分总和"
    ]
  };
  return validateRuleSpec(draft);
}

const systemPrompt = `You compile sports and game descriptions into a strict JSON rule specification.
Return JSON only. Never return JavaScript or executable code.
Conditions may reference only declared input field keys or the synthetic field "points".
Aggregate fields available inside endConditions use key.aggregation, such as won.sum or score.avg.
The winner metric may be "points" or an input field.
The structure must exactly match:
{"version":1,"title":"","description":"","playerCount":{"min":2,"max":8},"maxRounds":1,"inputFields":[{"key":"won","label":"","type":"boolean","description":"","required":true}],"scoring":[{"id":"","label":"","points":1,"when":{"field":"won","op":"eq","value":true}}],"endConditions":[{"label":"","scope":"any","when":{"field":"won.sum","op":"gte","value":2}}],"winner":{"metric":"points","aggregation":"sum","direction":"highest"},"tieBreakers":[],"explanation":"","summary":[""]}
Supported operators: eq, neq, gt, gte, lt, lte, in. Supported field types: number, boolean, string, enum.
Keep rules deterministic, auditable, and concise.`;

async function generateWithOpenAI(input: RuleGenerationInput): Promise<RuleSpec | null> {
  const apiKey = input.apiKey?.trim() || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: input.model?.trim() || process.env.OPENAI_MODEL || "gpt-4.1-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: JSON.stringify({
            description: input.description,
            preferredRounds: input.maxRounds,
            participantCount: input.players
          })
        }
      ]
    }),
    signal: AbortSignal.timeout(20_000)
  });

  if (!response.ok) {
    throw new Error(`AI 规则服务返回 ${response.status}`);
  }
  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI 未返回规则内容");
  return validateRuleSpec(JSON.parse(content));
}

export async function generateRules(input: RuleGenerationInput): Promise<{
  spec: RuleSpec;
  source: "ai" | "builtin";
  warning?: string;
}> {
  if (input.description.trim().length < 10) {
    throw new Error("请至少用 10 个字符描述比赛");
  }
  if (input.maxRounds < 1 || input.maxRounds > 99) {
    throw new Error("局数需在 1-99 之间");
  }
  if (input.players < 2 || input.players > 8) {
    throw new Error("参与人数需在 2-8 人之间");
  }

  try {
    const aiSpec = await generateWithOpenAI(input);
    if (aiSpec) return { spec: aiSpec, source: "ai" };
  } catch (error) {
    console.error(
      "AI rule generation fell back to built-in compiler:",
      error instanceof Error ? error.message : "unknown error"
    );
    return {
      spec: generateRuleDraft(input),
      source: "builtin",
      warning: "AI 规则服务暂时不可用，已使用本地确定性编译器生成。"
    };
  }
  return { spec: generateRuleDraft(input), source: "builtin" };
}

