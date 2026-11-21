import { NextResponse } from "next/server";
import { getStore } from "@/lib/db/store";
import {
  apiError,
  jsonBody,
  parseBytes32,
  requireActor
} from "@/lib/http/api";
import {
  configuredRegistry,
  participantsCommitment,
  verifyRegistryReceipt,
  type chainActionEvent
} from "@/lib/chain/registry";
import {
  attachChainReceipt,
  getCompetition
} from "@/lib/services/competition-service";

const actions = ["create", "result", "round", "dispute"] as const;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireActor();
    const { id } = await context.params;
    const body = await jsonBody(request);
    const action = body.action as keyof typeof chainActionEvent;
    if (!actions.includes(action as (typeof actions)[number])) throw new Error("未知链上操作");
    const txHash = parseBytes32(body.txHash, "交易哈希");
    const competition = await getCompetition(getStore(), id);
    if (!configuredRegistry()) throw new Error("链上登记合约未配置");
    if ((action === "create" || action === "result") && competition.creator !== actor) {
      throw new Error("只有创建者可以提交该公证");
    }
    if (action === "dispute") {
      const participant = competition.participants.find((item) => item.address === actor);
      if (!participant) throw new Error("只有参与者可以提交异议公证");
    }

    const detail = {
      roundIndex: Number(body.roundIndex || 0),
      reasonHash: body.reasonHash
        ? parseBytes32(body.reasonHash, "异议哈希")
        : undefined
    };
    const round =
      action === "round"
        ? competition.rounds.find((item) => item.index === detail.roundIndex)
        : undefined;
    const dispute =
      action === "dispute"
        ? competition.disputes.find((item) => item.reasonHash === detail.reasonHash)
        : undefined;
    await verifyRegistryReceipt({
      action,
      txHash,
      competitionId: id as `0x${string}`,
      rulesHash: action === "create" ? competition.rulesHash : undefined,
      participantsHash:
        action === "create"
          ? participantsCommitment(
              competition.participants.map((participant) => participant.address)
            )
          : undefined,
      roundIndex: action === "round" ? detail.roundIndex : undefined,
      roundHash: round?.roundHash || undefined,
      resultHash: action === "result" ? competition.result?.evidenceHash : undefined,
      reasonHash: dispute?.reasonHash,
      participant: action === "dispute" ? actor : undefined
    });
    return NextResponse.json(
      await attachChainReceipt(getStore(), id, action, txHash, detail)
    );
  } catch (error) {
    return apiError(error);
  }
}

