import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { readSessionToken, SESSION_COOKIE } from "@/lib/auth/session";
import type { Address } from "@/lib/domain/types";

export async function currentActor(): Promise<Address | null> {
  const cookieStore = await cookies();
  return readSessionToken(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function requireActor(): Promise<Address> {
  const actor = await currentActor();
  if (!actor) throw new AuthError("请先连接并验证钱包");
  return actor;
}

export class AuthError extends Error {}

export function apiError(error: unknown) {
  const message = error instanceof Error ? error.message : "服务器处理失败";
  const status = error instanceof AuthError ? 401 : 400;
  return NextResponse.json({ error: message }, { status });
}

export async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    throw new Error("请求数据不是有效 JSON");
  }
}

export function parseAddress(value: unknown): Address {
  if (typeof value !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error("钱包地址格式不正确");
  }
  return value.toLowerCase() as Address;
}

export function parseBytes32(value: unknown, label = "哈希"): `0x${string}` {
  if (typeof value !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error(`${label}格式不正确`);
  }
  return value.toLowerCase() as `0x${string}`;
}

