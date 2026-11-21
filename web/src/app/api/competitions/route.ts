import { NextResponse } from "next/server";
import { getStore } from "@/lib/db/store";
import { apiError, jsonBody, requireActor } from "@/lib/http/api";
import {
  createCompetition,
  listCompetitions
} from "@/lib/services/competition-service";
import { validateRuleSpec } from "@/lib/rules/schema";

export async function GET() {
  try {
    const competitions = await listCompetitions(getStore());
    return NextResponse.json({ competitions });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor();
    const body = await jsonBody(request);
    if (typeof body.description !== "string") throw new Error("缺少比赛描述");
    const spec = validateRuleSpec(body.spec);
    const invitedAddresses = Array.isArray(body.invitedAddresses)
      ? body.invitedAddresses.filter((address): address is string => typeof address === "string")
      : [];
    const result = await createCompetition(getStore(), {
      creator: actor,
      description: body.description,
      title: typeof body.title === "string" ? body.title : undefined,
      spec,
      invitedAddresses
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

