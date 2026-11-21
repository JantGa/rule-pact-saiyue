import {
  type Aggregation,
  type Condition,
  type RuleSpec,
  validateRuleSpec
} from "./schema";

export type RoundPayload = Record<string, unknown>;
export type ParticipantRound = {
  participant: `0x${string}`;
  data: RoundPayload;
};

export type ParticipantStanding = {
  participant: `0x${string}`;
  points: number;
  roundPoints: number;
  aggregates: Record<string, number>;
};

export type JudgeResult = {
  complete: boolean;
  endedBy: string | null;
  roundScores: ParticipantStanding[];
  aggregates: Record<string, number>;
  winners: `0x${string}`[];
  tie: boolean;
};

function valueAsComparable(value: unknown): string | number | boolean {
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  throw new Error("规则比较值类型不受支持");
}

function normalize(value: unknown): number | string | boolean {
  return valueAsComparable(value);
}

export function evaluateCondition(condition: Condition, data: RoundPayload): boolean {
  if ("field" in condition) {
    const actual = normalize(data[condition.field]);
    const expected = condition.value;
    switch (condition.op) {
      case "eq":
        return actual === expected;
      case "neq":
        return actual !== expected;
      case "in":
        return Array.isArray(expected) && expected.includes(actual);
      case "gt":
        return Number(actual) > Number(expected);
      case "gte":
        return Number(actual) >= Number(expected);
      case "lt":
        return Number(actual) < Number(expected);
      case "lte":
        return Number(actual) <= Number(expected);
    }
  }
  if ("all" in condition) {
    return condition.all.every((nested) => evaluateCondition(nested, data));
  }
  if ("any" in condition) {
    return condition.any.some((nested) => evaluateCondition(nested, data));
  }
  return !evaluateCondition(condition.not, data);
}

export function validatePayload(specInput: RuleSpec, payload: RoundPayload): RoundPayload {
  const spec = validateRuleSpec(specInput);
  const errors: string[] = [];
  const result: RoundPayload = {};

  for (const field of spec.inputFields) {
    const value = payload[field.key];
    if (value === undefined || value === null || value === "") {
      if (field.required) errors.push(`${field.label}不能为空`);
      continue;
    }

    if (field.type === "number") {
      const numberValue = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(numberValue)) {
        errors.push(`${field.label}必须是数字`);
        continue;
      }
      if (field.min != null && numberValue < field.min) {
        errors.push(`${field.label}不能小于${field.min}`);
      }
      if (field.max != null && numberValue > field.max) {
        errors.push(`${field.label}不能大于${field.max}`);
      }
      result[field.key] = numberValue;
      continue;
    }

    if (field.type === "boolean") {
      if (typeof value === "boolean") {
        result[field.key] = value;
      } else if (value === "true" || value === "false") {
        result[field.key] = value === "true";
      } else {
        errors.push(`${field.label}必须是布尔值`);
      }
      continue;
    }

    if (typeof value !== "string") {
      errors.push(`${field.label}必须是文本`);
      continue;
    }
    if (field.type === "enum" && !field.options?.includes(value)) {
      errors.push(`${field.label}不在允许选项中`);
    }
    result[field.key] = value;
  }

  if (errors.length) {
    throw new Error(errors.join("；"));
  }
  return result;
}

function aggregate(values: unknown[], method: Aggregation): number {
  const numbers = values.map((value) => Number(value)).filter(Number.isFinite);
  if (!numbers.length) return 0;
  switch (method) {
    case "sum":
      return numbers.reduce((total, value) => total + value, 0);
    case "avg":
      return numbers.reduce((total, value) => total + value, 0) / numbers.length;
    case "min":
      return Math.min(...numbers);
    case "max":
      return Math.max(...numbers);
    case "latest":
      return numbers.at(-1) ?? 0;
  }
}

function allAggregates(spec: RuleSpec, submissions: ParticipantRound[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const field of spec.inputFields) {
    for (const method of ["sum", "avg", "min", "max", "latest"] as const) {
      result[`${field.key}.${method}`] = aggregate(
        submissions.map((submission) => submission.data[field.key]),
        method
      );
    }
  }
  return result;
}

function conditionData(aggregates: Record<string, number>, extra: Record<string, number>) {
  return { ...aggregates, ...extra };
}

export function judgeRound(args: {
  spec: RuleSpec;
  roundIndex: number;
  players: `0x${string}`[];
  submissions: ParticipantRound[];
  priorPoints?: Record<string, number>;
  priorSubmissions?: Record<string, ParticipantRound[]>;
}): JudgeResult {
  const spec = validateRuleSpec(args.spec);
  if (args.roundIndex < 1) throw new Error("轮次必须从 1 开始");
  if (args.players.length < spec.playerCount.min || args.players.length > spec.playerCount.max) {
    throw new Error(`本规则要求 ${spec.playerCount.min}-${spec.playerCount.max} 名参与者`);
  }

  const expected = new Set(args.players.map((player) => player.toLowerCase()));
  if (args.submissions.length !== expected.size) {
    throw new Error("本轮数据尚未完整收齐");
  }

  const seen = new Set<string>();
  const submissions = args.submissions.map((submission) => {
    const participant = submission.participant.toLowerCase() as `0x${string}`;
    if (!expected.has(participant)) throw new Error("提交者不是本场比赛参与者");
    if (seen.has(participant)) throw new Error("同一参与者不能重复提交本轮数据");
    seen.add(participant);
    return { participant, data: validatePayload(spec, submission.data) };
  });

  const roundScores = submissions.map((submission): ParticipantStanding => {
    const roundPoints = spec.scoring.reduce(
      (total, rule) => total + (evaluateCondition(rule.when, submission.data) ? rule.points : 0),
      0
    );
    const prior = args.priorSubmissions?.[submission.participant] ?? [];
    const aggregates = allAggregates(spec, [...prior, submission]);
    return {
      participant: submission.participant,
      roundPoints,
      points: (args.priorPoints?.[submission.participant] ?? 0) + roundPoints,
      aggregates
    };
  });

  let endedBy: string | null = null;
  if (args.roundIndex >= spec.maxRounds) {
    endedBy = `达到 ${spec.maxRounds} 局上限`;
  } else {
    for (const end of spec.endConditions) {
      const checks = roundScores.map((standing) => {
        const data = conditionData(standing.aggregates, { points: standing.points });
        return evaluateCondition(end.when, data);
      });
      const triggered = end.scope === "any" ? checks.some(Boolean) : checks.every(Boolean);
      if (triggered) {
        endedBy = end.label;
        break;
      }
    }
  }

  const readMetric = (
    standing: ParticipantStanding,
    metric: string,
    aggregation: Aggregation
  ) =>
    metric === "points"
      ? standing.points
      : (standing.aggregates[metric.includes(".") ? metric : `${metric}.${aggregation}`] ?? 0);

  const compareDirection = (left: number, right: number, direction: "highest" | "lowest") =>
    direction === "highest" ? right - left : left - right;

  let winners: `0x${string}`[] = [];
  if (endedBy) {
    const ranked = [...roundScores].sort((left, right) => {
      const primary = compareDirection(
        readMetric(left, spec.winner.metric, spec.winner.aggregation),
        readMetric(right, spec.winner.metric, spec.winner.aggregation),
        spec.winner.direction
      );
      if (primary !== 0) return primary;
      for (const tieBreaker of spec.tieBreakers) {
        const tie = compareDirection(
          readMetric(left, tieBreaker.metric, tieBreaker.aggregation),
          readMetric(right, tieBreaker.metric, tieBreaker.aggregation),
          tieBreaker.direction
        );
        if (tie !== 0) return tie;
      }
      return 0;
    });
    const first = ranked[0];
    winners = ranked
      .filter((standing) => {
        if (
          readMetric(standing, spec.winner.metric, spec.winner.aggregation) !==
          readMetric(first, spec.winner.metric, spec.winner.aggregation)
        ) {
          return false;
        }
        return spec.tieBreakers.every(
          (tieBreaker) =>
            readMetric(standing, tieBreaker.metric, tieBreaker.aggregation) ===
            readMetric(first, tieBreaker.metric, tieBreaker.aggregation)
        );
      })
      .map((standing) => standing.participant);
  }

  return {
    complete: Boolean(endedBy),
    endedBy,
    roundScores,
    aggregates: Object.fromEntries(roundScores.map((standing) => [standing.participant, standing.points])),
    winners,
    tie: endedBy != null && winners.length !== 1
  };
}

