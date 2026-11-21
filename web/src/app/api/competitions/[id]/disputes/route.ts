import { NextResponse } from "next/server";
import { getStore } from "@/lib/db/store";
import { apiError, jsonBody, requireActor } from "@/lib/http/api";
import { raiseDispute } from "@/lib/services/competition-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireActor();
    const { id } = await context.params;
    const body = await jsonBody(request);
    if (typeof body.reason !== "string") throw new Error("请填写异议原因");
    return NextResponse.json(await raiseDispute(getStore(), id, actor, body.reason));
  } catch (error) {
    return apiError(error);
  }
}

