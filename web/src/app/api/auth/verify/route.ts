import { NextResponse } from "next/server";
import { verifyMessage } from "viem";
import {
  consumeChallenge,
  createSessionToken,
  SESSION_COOKIE
} from "@/lib/auth/session";
import { getStore } from "@/lib/db/store";
import { apiError, jsonBody, parseAddress } from "@/lib/http/api";

export async function POST(request: Request) {
  try {
    const body = await jsonBody(request);
    const address = parseAddress(body.address);
    if (typeof body.signature !== "string" || !body.signature.startsWith("0x")) {
      throw new Error("钱包签名格式不正确");
    }
    const challenge = await consumeChallenge(getStore(), address);
    const valid = await verifyMessage({
      address,
      message: challenge.message,
      signature: body.signature as `0x${string}`
    });
    if (!valid) throw new Error("钱包签名验证失败");

    const response = NextResponse.json({ address, authenticated: true });
    response.cookies.set(SESSION_COOKIE, createSessionToken(address), {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 7 * 24 * 60 * 60
    });
    return response;
  } catch (error) {
    return apiError(error);
  }
}

