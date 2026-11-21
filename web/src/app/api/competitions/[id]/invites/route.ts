import { NextResponse } from "next/server";
import { getStore } from "@/lib/db/store";
import { apiError, jsonBody, requireActor } from "@/lib/http/api";
import { inviteParticipants } from "@/lib/services/competition-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireActor();
    const { id } = await context.params;
    const body = await jsonBody(request);
    if (!Array.isArray(body.addresses) || !body.addresses.every((item) => typeof item === "string")) {
      throw new Error("请提供参与者钱包地址列表");
    }
    return NextResponse.json(
      await inviteParticipants(getStore(), id, actor, body.addresses as string[])
    );
  } catch (error) {
    return apiError(error);
  }
}

