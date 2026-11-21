import { NextResponse } from "next/server";
import { getStore } from "@/lib/db/store";
import { apiError, requireActor } from "@/lib/http/api";
import { acceptInvite } from "@/lib/services/competition-service";

export async function POST(
  _request: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const actor = await requireActor();
    const { token } = await context.params;
    return NextResponse.json(await acceptInvite(getStore(), token, actor));
  } catch (error) {
    return apiError(error);
  }
}

