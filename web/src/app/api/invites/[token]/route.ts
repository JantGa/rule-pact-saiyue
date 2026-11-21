import { NextResponse } from "next/server";
import { getStore } from "@/lib/db/store";
import { apiError } from "@/lib/http/api";
import { getInvite } from "@/lib/services/competition-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    return NextResponse.json(await getInvite(getStore(), token));
  } catch (error) {
    return apiError(error);
  }
}

