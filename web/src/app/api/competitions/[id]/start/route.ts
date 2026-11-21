import { NextResponse } from "next/server";
import { getStore } from "@/lib/db/store";
import { apiError, jsonBody, requireActor } from "@/lib/http/api";
import {
  configuredRegistry,
  localChainAllowed,
  participantsCommitment,
  verifyRegistryReceipt
} from "@/lib/chain/registry";
import {
  getCompetition,
  startCompetition
} from "@/lib/services/competition-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireActor();
    const { id } = await context.params;
    const body = await jsonBody(request);
    if (!configuredRegistry() && !localChainAllowed()) {
      throw new Error("生产环境未配置比赛登记合约，无法开局");
    }
    if (configuredRegistry()) {
      if (typeof body.txHash !== "string") throw new Error("链上开始交易缺失");
      const competition = await getCompetition(getStore(), id);
      await verifyRegistryReceipt({
        action: "start",
        txHash: body.txHash as `0x${string}`,
        competitionId: id as `0x${string}`,
        participantsHash: participantsCommitment(
          competition.participants.map((participant) => participant.address)
        )
      });
      await getStore().update((state) => {
        const competition = state.competitions[id.toLowerCase()];
        if (!competition) throw new Error("比赛不存在");
        competition.chain.startTxHash = body.txHash as `0x${string}`;
      });
    }
    return NextResponse.json(await startCompetition(getStore(), id, actor));
  } catch (error) {
    return apiError(error);
  }
}

