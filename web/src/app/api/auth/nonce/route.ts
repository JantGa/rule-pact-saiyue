import { NextResponse } from "next/server";
import { issueChallenge } from "@/lib/auth/session";
import { getStore } from "@/lib/db/store";
import { apiError, jsonBody, parseAddress } from "@/lib/http/api";

export async function POST(request: Request) {
  try {
    const body = await jsonBody(request);
    const challenge = await issueChallenge(getStore(), parseAddress(body.address));
    return NextResponse.json(challenge);
  } catch (error) {
    return apiError(error);
  }
}

