import { NextResponse } from "next/server";
import { getStore } from "@/lib/db/store";
import { apiError, jsonBody, requireActor } from "@/lib/http/api";
import { submitRoundData } from "@/lib/services/competition-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireActor();
    const { id } = await context.params;
    const body = await jsonBody(request);
    if (!body.data || typeof body.data !== "object" || Array.isArray(body.data)) {
      throw new Error("缺少本轮比赛数据");
    }
    return NextResponse.json(
      await submitRoundData(
        getStore(),
        id,
        actor,
        body.data as Record<string, unknown>
      )
    );
  } catch (error) {
    return apiError(error);
  }
}

