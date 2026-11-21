import type { RuleSpec } from "@/lib/rules/schema";

export type Address = `0x${string}`;
export type CompetitionStatus = "inviting" | "ready" | "active" | "completed";

export type Participant = {
  address: Address;
  status: "pending" | "active" | "declined";
  invitedAt: string;
  joinedAt: string | null;
};

export type Submission = {
  participant: Address;
  data: Record<string, unknown>;
  submittedAt: string;
  payloadHash: `0x${string}`;
};

export type Round = {
  index: number;
  submissions: Submission[];
  complete: boolean;
  completedAt: string | null;
  scores: Array<{
    participant: Address;
    points: number;
    roundPoints: number;
    aggregates: Record<string, number>;
  }>;
  roundHash: `0x${string}` | null;
  chainTxHash: `0x${string}` | null;
};

export type CompetitionResult = {
  outcome: "winner" | "tie";
  winners: Address[];
  standings: Array<{
    participant: Address;
    points: number;
    roundPoints: number;
    aggregates: Record<string, number>;
  }>;
  endedBy: string;
  evidenceHash: `0x${string}`;
  decidedAt: string;
  summary: string;
};

export type Dispute = {
  id: string;
  participant: Address;
  reason: string;
  reasonHash: `0x${string}`;
  createdAt: string;
  chainTxHash: `0x${string}` | null;
};

export type Competition = {
  id: `0x${string}`;
  title: string;
  description: string;
  creator: Address;
  createdAt: string;
  updatedAt: string;
  status: CompetitionStatus;
  spec: RuleSpec;
  rulesHash: `0x${string}`;
  participants: Participant[];
  rounds: Round[];
  result: CompetitionResult | null;
  disputes: Dispute[];
  chain: {
    createTxHash: `0x${string}` | null;
    startTxHash: `0x${string}` | null;
    resultTxHash: `0x${string}` | null;
  };
};

export type Invite = {
  tokenHash: `0x${string}`;
  competitionId: `0x${string}`;
  address: Address;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
};

export type Challenge = {
  address: Address;
  nonce: string;
  message: string;
  expiresAt: string;
};

export type DbState = {
  challenges: Record<string, Challenge>;
  competitions: Record<string, Competition>;
  invites: Record<string, Invite>;
};

export type PublicParticipant = Participant;
export type PublicCompetition = Omit<Competition, "participants"> & {
  participants: PublicParticipant[];
  isChainConfigured: boolean;
  isLocalChainAllowed: boolean;
  createTxHash: `0x${string}` | null;
};

