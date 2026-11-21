import { randomBytes, createHash } from "node:crypto";
import type { Store } from "@/lib/db/store";
import {
  type Address,
  type Competition,
  type Invite,
  type PublicCompetition
} from "@/lib/domain/types";
import { hashArtifact } from "@/lib/rules/hash";
import { judgeRound, type ParticipantRound } from "@/lib/rules/engine";
import { validateRuleSpec, type RuleSpec } from "@/lib/rules/schema";
import { localChainAllowed } from "@/lib/chain/registry";

function nowIso() {
  return new Date().toISOString();
}

function competitionOrThrow(stateCompetitions: Record<string, Competition>, id: string) {
  const competition = stateCompetitions[id.toLowerCase()];
  if (!competition) throw new Error("比赛不存在");
  return competition;
}

function tokenHash(token: string): `0x${string}` {
  return `0x${createHash("sha256").update(token).digest("hex")}`;
}

function normalize(input: string): Address {
  if (!/^0x[a-fA-F0-9]{40}$/.test(input)) throw new Error(`钱包地址格式不正确：${input}`);
  return input.toLowerCase() as Address;
}

function uniqueAddresses(addresses: string[]) {
  const normalized = addresses.map(normalize);
  if (new Set(normalized).size !== normalized.length) throw new Error("参与者钱包地址不能重复");
  return normalized;
}

function makeInvite(
  stateInvites: Record<string, Invite>,
  competitionId: `0x${string}`,
  address: Address
) {
  const token = randomBytes(24).toString("base64url");
  const hashed = tokenHash(token);
  stateInvites[hashed] = {
    tokenHash: hashed,
    competitionId,
    address,
    createdAt: nowIso(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    acceptedAt: null
  };
  return {
    address,
    token,
    url: `${process.env.FAIRPLAY_PUBLIC_URL || "http://localhost:3100"}/invite/${token}`
  };
}

export function publicCompetition(competition: Competition): PublicCompetition {
  return {
    ...competition,
    isChainConfigured: Boolean(process.env.NEXT_PUBLIC_REGISTRY_ADDRESS),
    isLocalChainAllowed: localChainAllowed(),
    createTxHash: competition.chain.createTxHash
  };
}

export async function createCompetition(
  store: Store,
  input: {
    creator: Address;
    title?: string;
    description: string;
    spec: RuleSpec;
    invitedAddresses?: string[];
  }
) {
  const spec = validateRuleSpec(input.spec);
  const invited = uniqueAddresses(input.invitedAddresses ?? []);
  if (invited.includes(input.creator)) throw new Error("创建者无需重复邀请自己");
  const allCount = invited.length + 1;
  if (allCount > spec.playerCount.max) {
    throw new Error(`规则最多允许 ${spec.playerCount.max} 人`);
  }

  return store.update((state) => {
    const timestamp = nowIso();
    let id = `0x${randomBytes(32).toString("hex")}` as `0x${string}`;
    while (state.competitions[id]) id = `0x${randomBytes(32).toString("hex")}`;
    const competition: Competition = {
      id,
      title: input.title?.trim() || spec.title,
      description: input.description.trim(),
      creator: input.creator,
      createdAt: timestamp,
      updatedAt: timestamp,
      status: "inviting",
      spec,
      rulesHash: hashArtifact(spec),
      participants: [
        {
          address: input.creator,
          status: "active",
          invitedAt: timestamp,
          joinedAt: timestamp
        },
        ...invited.map((address) => ({
          address,
          status: "pending" as const,
          invitedAt: timestamp,
          joinedAt: null
        }))
      ],
      rounds: [],
      result: null,
      disputes: [],
      chain: { createTxHash: null, startTxHash: null, resultTxHash: null }
    };
    const invites = invited.map((address) => makeInvite(state.invites, id, address));
    state.competitions[id] = competition;
    return { competition: publicCompetition(competition), invites };
  });
}

export async function inviteParticipants(
  store: Store,
  competitionId: string,
  actor: Address,
  addresses: string[]
) {
  const normalized = uniqueAddresses(addresses);
  return store.update((state) => {
    const competition = competitionOrThrow(state.competitions, competitionId);
    if (competition.creator !== actor) throw new Error("只有创建者可以邀请参与者");
    if (competition.status !== "inviting") throw new Error("比赛已不能继续邀请参与者");
    if (competition.participants.length + normalized.length > competition.spec.playerCount.max) {
      throw new Error(`规则最多允许 ${competition.spec.playerCount.max} 人`);
    }
    const existing = new Set(competition.participants.map((participant) => participant.address));
    const duplicates = normalized.filter((address) => existing.has(address));
    if (duplicates.length) throw new Error("有参与者已在比赛中");

    const invites = normalized.map((address) => {
      competition.participants.push({
        address,
        status: "pending",
        invitedAt: nowIso(),
        joinedAt: null
      });
      return makeInvite(state.invites, competition.id, address);
    });
    competition.updatedAt = nowIso();
    return { competition: publicCompetition(competition), invites };
  });
}

export async function acceptInvite(store: Store, token: string, actor: Address) {
  return store.update((state) => {
    const invite = state.invites[tokenHash(token)];
    if (!invite) throw new Error("邀请链接无效");
    if (invite.address !== actor) throw new Error("请使用被邀请的钱包登录");
    if (invite.acceptedAt) return publicCompetition(competitionOrThrow(state.competitions, invite.competitionId));
    if (new Date(invite.expiresAt).getTime() <= Date.now()) throw new Error("邀请链接已过期");

    const competition = competitionOrThrow(state.competitions, invite.competitionId);
    const participant = competition.participants.find((item) => item.address === actor);
    if (!participant) throw new Error("比赛参与者记录不存在");
    participant.status = "active";
    participant.joinedAt = nowIso();
    invite.acceptedAt = nowIso();
    competition.updatedAt = nowIso();

    const everyoneAccepted = competition.participants.every((item) => item.status === "active");
    const validSize =
      competition.participants.length >= competition.spec.playerCount.min &&
      competition.participants.length <= competition.spec.playerCount.max;
    if (everyoneAccepted && validSize) competition.status = "ready";
    return publicCompetition(competition);
  });
}

export async function startCompetition(store: Store, competitionId: string, actor: Address) {
  return store.update((state) => {
    const competition = competitionOrThrow(state.competitions, competitionId);
    if (competition.creator !== actor) throw new Error("只有创建者可以开始比赛");
    if (competition.status !== "ready") throw new Error("参与者尚未全部接受邀请");
    if (competition.participants.some((participant) => participant.status !== "active")) {
      throw new Error("仍有参与者未接受邀请");
    }
    competition.status = "active";
    competition.rounds.push({
      index: 1,
      submissions: [],
      complete: false,
      completedAt: null,
      scores: [],
      roundHash: null,
      chainTxHash: null
    });
    competition.updatedAt = nowIso();
    return publicCompetition(competition);
  });
}

export async function submitRoundData(
  store: Store,
  competitionId: string,
  actor: Address,
  data: Record<string, unknown>
) {
  return store.update((state) => {
    const competition = competitionOrThrow(state.competitions, competitionId);
    if (competition.status !== "active") throw new Error("比赛当前不在进行中");
    if (!competition.participants.some((item) => item.address === actor && item.status === "active")) {
      throw new Error("仅本场参与者可以提交数据");
    }
    const activeRound = competition.rounds.at(-1);
    if (!activeRound || activeRound.complete) throw new Error("当前轮次已经结算");
    if (activeRound.submissions.some((item) => item.participant === actor)) {
      throw new Error("你已提交过本轮数据");
    }
    activeRound.submissions.push({
      participant: actor,
      data,
      submittedAt: nowIso(),
      payloadHash: hashArtifact({ participant: actor, data })
    });

    const players = competition.participants.map((item) => item.address);
    if (activeRound.submissions.length < players.length) {
      competition.updatedAt = nowIso();
      return publicCompetition(competition);
    }

    const priorPoints: Record<string, number> = {};
    const priorSubmissions: Record<string, ParticipantRound[]> = {};
    for (const round of competition.rounds.slice(0, -1)) {
      if (round.complete) {
        for (const score of round.scores) {
          priorPoints[score.participant] = score.points;
          priorSubmissions[score.participant] ??= [];
          priorSubmissions[score.participant].push(
            ...round.submissions.filter((submission) => submission.participant === score.participant)
          );
        }
      }
    }

    const judged = judgeRound({
      spec: competition.spec,
      roundIndex: activeRound.index,
      players,
      submissions: activeRound.submissions,
      priorPoints,
      priorSubmissions
    });
    activeRound.complete = true;
    activeRound.completedAt = nowIso();
    activeRound.scores = judged.roundScores;
    activeRound.roundHash = hashArtifact({
      competitionId: competition.id,
      rulesHash: competition.rulesHash,
      index: activeRound.index,
      submissions: activeRound.submissions.map((submission) => ({
        participant: submission.participant,
        payloadHash: submission.payloadHash
      }))
    });

    if (!judged.complete) {
      competition.rounds.push({
        index: activeRound.index + 1,
        submissions: [],
        complete: false,
        completedAt: null,
        scores: [],
        roundHash: null,
        chainTxHash: null
      });
    } else {
      competition.status = "completed";
      const decidedAt = nowIso();
      const outcome = judged.winners.length === 1 ? "winner" : "tie";
      const resultEvidence = {
        competitionId: competition.id,
        rulesHash: competition.rulesHash,
        participants: players,
        rounds: competition.rounds.map((round) => round.roundHash),
        outcome,
        winners: judged.winners,
        endedBy: judged.endedBy
      };
      competition.result = {
        outcome,
        winners: judged.winners,
        standings: judged.roundScores,
        endedBy: judged.endedBy || "比赛结束",
        evidenceHash: hashArtifact(resultEvidence),
        decidedAt,
        summary: judged.tie
          ? "按全部已确认规则比较后为平局"
          : "按全部已确认规则完成自动判分"
      };
    }

    competition.updatedAt = nowIso();
    return publicCompetition(competition);
  });
}

export async function raiseDispute(
  store: Store,
  competitionId: string,
  actor: Address,
  reason: string
) {
  const cleaned = reason.trim();
  if (cleaned.length < 4 || cleaned.length > 1000) throw new Error("异议说明应为 4-1000 个字符");
  return store.update((state) => {
    const competition = competitionOrThrow(state.competitions, competitionId);
    if (!competition.result || competition.status !== "completed") throw new Error("比赛尚未结束");
    if (!competition.participants.some((item) => item.address === actor)) {
      throw new Error("只有本场参与者可以提出异议");
    }
    if (competition.disputes.some((item) => item.participant === actor)) {
      throw new Error("你已提交过本场异议");
    }
    competition.disputes.push({
      id: randomBytes(12).toString("hex"),
      participant: actor,
      reason: cleaned,
      reasonHash: hashArtifact({ competitionId, participant: actor, reason: cleaned }),
      createdAt: nowIso(),
      chainTxHash: null
    });
    competition.updatedAt = nowIso();
    return publicCompetition(competition);
  });
}

export async function listCompetitions(store: Store, actor?: Address) {
  const state = await store.read();
  return Object.values(state.competitions)
    .filter((competition) =>
      actor
        ? competition.creator === actor ||
          competition.participants.some((participant) => participant.address === actor)
        : true
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map(publicCompetition);
}

export async function getCompetition(store: Store, competitionId: string) {
  const state = await store.read();
  return publicCompetition(competitionOrThrow(state.competitions, competitionId));
}

export async function getInvite(store: Store, token: string) {
  const state = await store.read();
  const invite = state.invites[tokenHash(token)];
  if (!invite) throw new Error("邀请链接无效");
  const competition = competitionOrThrow(state.competitions, invite.competitionId);
  return {
    address: invite.address,
    expiresAt: invite.expiresAt,
    accepted: Boolean(invite.acceptedAt),
    competition: {
      id: competition.id,
      title: competition.title,
      creator: competition.creator,
      rulesHash: competition.rulesHash,
      status: competition.status
    }
  };
}

export async function getPlayerStats(store: Store, actor: Address) {
  const state = await store.read();
  const played = Object.values(state.competitions).filter(
    (competition) =>
      competition.status === "completed" &&
      competition.participants.some((participant) => participant.address === actor)
  );
  const wins = played.filter((competition) => competition.result?.winners.includes(actor)).length;
  const ties = played.filter((competition) => competition.result?.outcome === "tie").length;
  const losses = played.length - wins - ties;
  return {
    played: played.length,
    wins,
    losses,
    ties,
    winRate: played.length ? Math.round((wins / played.length) * 1000) / 10 : 0,
    history: played.map((competition) => ({
      id: competition.id,
      title: competition.title,
      outcome:
        competition.result?.outcome === "tie"
          ? "tie"
          : competition.result?.winners.includes(actor)
            ? "win"
            : "loss",
      points:
        competition.result?.standings.find((standing) => standing.participant === actor)?.points ?? 0,
      decidedAt: competition.result?.decidedAt ?? competition.updatedAt
    }))
  };
}

export async function attachChainReceipt(
  store: Store,
  competitionId: string,
  action: "create" | "start" | "result" | "round" | "dispute",
  txHash: `0x${string}`,
  detail?: { roundIndex?: number; reasonHash?: `0x${string}` }
) {
  return store.update((state) => {
    const competition = competitionOrThrow(state.competitions, competitionId);
    if (action === "create") {
      if (competition.chain.createTxHash) throw new Error("规则已在链上公证");
      if (
        competition.status !== "ready" ||
        competition.participants.some((participant) => participant.status !== "active")
      ) {
        throw new Error("全部参与者接受邀请后才能公证规则");
      }
      competition.chain.createTxHash = txHash;
    } else if (action === "start") {
      if (!competition.chain.createTxHash) throw new Error("请先公证规则");
      if (competition.chain.startTxHash) throw new Error("比赛已经开局");
      competition.chain.startTxHash = txHash;
    } else if (action === "result") {
      if (!competition.chain.startTxHash) throw new Error("请先开始链上比赛");
      if (!competition.result) throw new Error("比赛结果尚未生成");
      if (competition.rounds.some((round) => round.complete && !round.chainTxHash)) {
        throw new Error("请先完成每一局证据的链上公证");
      }
      if (competition.chain.resultTxHash) throw new Error("结果已经公证");
      competition.chain.resultTxHash = txHash;
    } else if (action === "round") {
      const round = competition.rounds.find((item) => item.index === detail?.roundIndex);
      if (!round || !round.complete) throw new Error("轮次尚未完成");
      if (round.chainTxHash) throw new Error("轮次已经公证");
      round.chainTxHash = txHash;
    } else {
      const dispute = competition.disputes.find((item) => item.reasonHash === detail?.reasonHash);
      if (!dispute) throw new Error("异议记录不存在");
      if (dispute.chainTxHash) throw new Error("异议已经公证");
      dispute.chainTxHash = txHash;
    }
    competition.updatedAt = nowIso();
    return publicCompetition(competition);
  });
}

