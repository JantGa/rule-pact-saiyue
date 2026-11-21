import {
  createPublicClient,
  decodeEventLog,
  http,
  isAddress,
  type Address,
  type TransactionReceipt
} from "viem";
import { monadTestnet } from "wagmi/chains";
import { hashArtifact } from "@/lib/rules/hash";

export const registryAbi = [
  {
    type: "function",
    name: "createCompetition",
    stateMutability: "nonpayable",
    inputs: [
      { name: "competitionId", type: "bytes32" },
      { name: "rulesHash", type: "bytes32" },
      { name: "participantList", type: "address[]" },
      { name: "metadataURI", type: "string" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "startCompetition",
    stateMutability: "nonpayable",
    inputs: [
      { name: "competitionId", type: "bytes32" },
      { name: "participantsHash", type: "bytes32" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "recordRound",
    stateMutability: "nonpayable",
    inputs: [
      { name: "competitionId", type: "bytes32" },
      { name: "round", type: "uint32" },
      { name: "roundHash", type: "bytes32" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "finalizeCompetition",
    stateMutability: "nonpayable",
    inputs: [
      { name: "competitionId", type: "bytes32" },
      { name: "resultHash", type: "bytes32" },
      { name: "winner", type: "address" },
      { name: "evidenceURI", type: "string" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "raiseDispute",
    stateMutability: "nonpayable",
    inputs: [
      { name: "competitionId", type: "bytes32" },
      { name: "reasonHash", type: "bytes32" }
    ],
    outputs: []
  },
  {
    type: "event",
    name: "CompetitionCreated",
    inputs: [
      { name: "competitionId", type: "bytes32", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "rulesHash", type: "bytes32", indexed: true },
      { name: "metadataURI", type: "string", indexed: false }
    ]
  },
  {
    type: "event",
    name: "CompetitionStarted",
    inputs: [
      { name: "competitionId", type: "bytes32", indexed: true },
      { name: "participantsHash", type: "bytes32", indexed: true },
      { name: "participantCount", type: "uint32", indexed: false }
    ]
  },
  {
    type: "event",
    name: "RoundRecorded",
    inputs: [
      { name: "competitionId", type: "bytes32", indexed: true },
      { name: "round", type: "uint32", indexed: true },
      { name: "roundHash", type: "bytes32", indexed: true }
    ]
  },
  {
    type: "event",
    name: "CompetitionFinalized",
    inputs: [
      { name: "competitionId", type: "bytes32", indexed: true },
      { name: "resultHash", type: "bytes32", indexed: true },
      { name: "winner", type: "address", indexed: true },
      { name: "evidenceURI", type: "string", indexed: false }
    ]
  },
  {
    type: "event",
    name: "DisputeRaised",
    inputs: [
      { name: "competitionId", type: "bytes32", indexed: true },
      { name: "participant", type: "address", indexed: true },
      { name: "reasonHash", type: "bytes32", indexed: true }
    ]
  }
] as const;

export const chainActionEvent = {
  create: "CompetitionCreated",
  start: "CompetitionStarted",
  round: "RoundRecorded",
  result: "CompetitionFinalized",
  dispute: "DisputeRaised"
} as const;

export function participantsCommitment(addresses: string[]) {
  return hashArtifact({
    kind: "fairplay-participants-v1",
    participants: [...addresses].map((address) => address.toLowerCase()).sort()
  });
}

export function configuredRegistry(): Address | null {
  const value = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS;
  return value && isAddress(value) ? value : null;
}

export function localChainAllowed() {
  const configured = process.env.FAIRPLAY_ALLOW_LOCAL_CHAIN;
  if (configured != null) return configured === "true";
  return process.env.NODE_ENV !== "production";
}

export function chainClient() {
  return createPublicClient({
    chain: monadTestnet,
    transport: http(
      process.env.NEXT_PUBLIC_MONAD_RPC_URL || "https://testnet-rpc.monad.xyz"
    )
  });
}

export async function verifyRegistryReceipt(args: {
  action: keyof typeof chainActionEvent;
  txHash: `0x${string}`;
  competitionId: `0x${string}`;
  rulesHash?: `0x${string}`;
  resultHash?: `0x${string}`;
  participantsHash?: `0x${string}`;
  roundIndex?: number;
  roundHash?: `0x${string}`;
  reasonHash?: `0x${string}`;
  participant?: Address;
}) {
  const registry = configuredRegistry();
  if (!registry) throw new Error("链上登记合约未配置");
  const receipt = await chainClient().getTransactionReceipt({ hash: args.txHash });
  if (receipt.status !== "success") throw new Error("链上交易执行失败");
  if (receipt.to?.toLowerCase() !== registry.toLowerCase()) {
    throw new Error("交易目标不是比赛登记合约");
  }

  const eventName = chainActionEvent[args.action];
  const matching = receipt.logs.find((log) => {
    if (log.address.toLowerCase() !== registry.toLowerCase()) return false;
    try {
      const decoded = decodeEventLog({
        abi: registryAbi,
        data: log.data,
        topics: log.topics
      });
      if (decoded.eventName !== eventName) return false;
      const eventArgs = decoded.args as {
        competitionId?: string;
        rulesHash?: string;
        resultHash?: string;
        participantsHash?: string;
        round?: bigint;
        roundHash?: string;
        reasonHash?: string;
        participant?: string;
      };
      if (eventArgs.competitionId?.toLowerCase() !== args.competitionId.toLowerCase()) return false;
      if (args.rulesHash && eventArgs.rulesHash && eventArgs.rulesHash !== args.rulesHash) {
        return false;
      }
      if (args.resultHash && eventArgs.resultHash !== args.resultHash) return false;
      if (args.participantsHash && eventArgs.participantsHash !== args.participantsHash) return false;
      if (args.roundIndex != null && Number(eventArgs.round) !== args.roundIndex) return false;
      if (args.roundHash && eventArgs.roundHash !== args.roundHash) return false;
      if (args.reasonHash && eventArgs.reasonHash !== args.reasonHash) return false;
      if (
        args.participant &&
        eventArgs.participant?.toLowerCase() !== args.participant.toLowerCase()
      ) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  });
  if (!matching) throw new Error("交易中未找到对应比赛的公证事件");
  return receipt as TransactionReceipt;
}

