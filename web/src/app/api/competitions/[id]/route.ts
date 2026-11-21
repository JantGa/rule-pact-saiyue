import { NextResponse } from "next/server";
import { getStore } from "@/lib/db/store";
import { apiError } from "@/lib/http/api";
import { getCompetition } from "@/lib/services/competition-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    return NextResponse.json(await getCompetition(getStore(), id));
  } catch (error) {
    return apiError(error);
  }
}

