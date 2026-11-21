import { z } from "zod";

export type ComparisonOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in";
export type Aggregation = "sum" | "avg" | "min" | "max" | "latest";

export type Condition =
  | {
      field: string;
      op: ComparisonOperator;
      value: string | number | boolean | Array<string | number | boolean>;
    }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition };

export type InputField = {
  key: string;
  label: string;
  type: "number" | "boolean" | "string" | "enum";
  description: string;
  required: boolean;
  min?: number;
  max?: number;
  options?: string[];
};

export type ScoringRule = {
  id: string;
  label: string;
  points: number;
  when: Condition;
};

export type RuleSpec = {
  version: 1;
  title: string;
  description: string;
  playerCount: { min: number; max: number };
  maxRounds: number;
  inputFields: InputField[];
  scoring: ScoringRule[];
  endConditions: Array<{
    label: string;
    scope: "any" | "all";
    when: Condition;
  }>;
  winner: {
    metric: string;
    aggregation: Aggregation;
    direction: "highest" | "lowest";
  };
  tieBreakers: Array<{
    metric: string;
    aggregation: Aggregation;
    direction: "highest" | "lowest";
  }>;
  explanation: string;
  summary: string[];
};

const scalar = z.union([z.string(), z.number(), z.boolean()]);
const comparable = z.union([scalar, z.array(scalar)]);

const fieldSchema = z.object({
  key: z.string().min(1).max(48).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
  label: z.string().min(1).max(80),
  type: z.enum(["number", "boolean", "string", "enum"]),
  description: z.string().max(240).default(""),
  required: z.boolean().default(true),
  min: z.number().finite().optional(),
  max: z.number().finite().optional(),
  options: z.array(z.string().min(1).max(64)).min(1).max(30).optional()
});

export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.object({
      field: z.string().min(1),
      op: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "in"]),
      value: comparable
    }),
    z.object({ all: z.array(conditionSchema).min(1).max(20) }),
    z.object({ any: z.array(conditionSchema).min(1).max(20) }),
    z.object({ not: conditionSchema })
  ])
);

export const ruleSpecSchema = z.object({
  version: z.literal(1),
  title: z.string().min(2).max(100),
  description: z.string().min(10).max(2000),
  playerCount: z.object({
    min: z.number().int().min(2).max(8),
    max: z.number().int().min(2).max(8)
  }),
  maxRounds: z.number().int().min(1).max(99),
  inputFields: z.array(fieldSchema).min(1).max(8),
  scoring: z
    .array(
      z.object({
        id: z.string().min(1).max(48),
        label: z.string().min(1).max(120),
        points: z.number().min(-100).max(100),
        when: conditionSchema
      })
    )
    .max(15),
  endConditions: z
    .array(
      z.object({
        label: z.string().min(1).max(120),
        scope: z.enum(["any", "all"]),
        when: conditionSchema
      })
    )
    .max(10),
  winner: z.object({
    metric: z.string().min(1),
    aggregation: z.enum(["sum", "avg", "min", "max", "latest"]),
    direction: z.enum(["highest", "lowest"])
  }),
  tieBreakers: z
    .array(
      z.object({
        metric: z.string().min(1),
        aggregation: z.enum(["sum", "avg", "min", "max", "latest"]),
        direction: z.enum(["highest", "lowest"])
      })
    )
    .max(5)
    .default([]),
  explanation: z.string().min(10).max(4000),
  summary: z.array(z.string().min(2).max(180)).min(1).max(8)
});

function collectFields(condition: Condition, fields: string[]) {
  if ("field" in condition) {
    fields.push(condition.field);
  } else if ("all" in condition) {
    condition.all.forEach((nested) => collectFields(nested, fields));
  } else if ("any" in condition) {
    condition.any.forEach((nested) => collectFields(nested, fields));
  } else {
    collectFields(condition.not, fields);
  }
}

export function validateRuleSpec(value: unknown): RuleSpec {
  const parsed = ruleSpecSchema.parse(value);
  if (parsed.playerCount.min > parsed.playerCount.max) {
    throw new Error("最少人数不能大于最多人数");
  }

  const keys = parsed.inputFields.map((field) => field.key);
  if (new Set(keys).size !== keys.length) {
    throw new Error("比赛数据字段名不能重复");
  }

  const aggregateNames = keys.flatMap((key) =>
    ["sum", "avg", "min", "max", "latest"].map((method) => `${key}.${method}`)
  );
  const knownFields = new Set([...keys, ...aggregateNames, "points"]);
  for (const rule of parsed.scoring) {
    const referenced: string[] = [];
    collectFields(rule.when, referenced);
    const unknown = referenced.find((field) => !keys.includes(field));
    if (unknown) {
      throw new Error(`计分规则只能引用本局输入字段：${unknown}`);
    }
  }
  for (const rule of parsed.endConditions) {
    const referenced: string[] = [];
    collectFields(rule.when, referenced);
    const unknown = referenced.find(
      (field) => field !== "points" && !aggregateNames.includes(field)
    );
    if (unknown) {
      throw new Error(`结束条件必须引用聚合字段或 points：${unknown}`);
    }
  }

  for (const field of parsed.inputFields) {
    if (field.type === "number" && field.min != null && field.max != null && field.min > field.max) {
      throw new Error(`${field.label} 的最小值不能大于最大值`);
    }
    if (field.type === "enum" && !field.options?.length) {
      throw new Error(`枚举字段 ${field.label} 必须提供选项`);
    }
  }

  if (!knownFields.has(parsed.winner.metric)) {
    throw new Error(`胜负指标不存在：${parsed.winner.metric}`);
  }
  for (const tieBreaker of parsed.tieBreakers) {
    if (!knownFields.has(tieBreaker.metric)) {
      throw new Error(`同分指标不存在：${tieBreaker.metric}`);
    }
  }

  return parsed;
}

export function isCondition(value: unknown): value is Condition {
  return conditionSchema.safeParse(value).success;
}

