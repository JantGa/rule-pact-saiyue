import { NextResponse } from "next/server";
import { apiError, jsonBody, requireActor } from "@/lib/http/api";
import { generateRules } from "@/lib/rules/generator";
import { hashArtifact } from "@/lib/rules/hash";

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    await requireActor();
    const body = await jsonBody(request);
    if (typeof body.description !== "string") throw new Error("缺少比赛描述");
    if (body.apiKey != null && typeof body.apiKey !== "string") {
      throw new Error("AI Key 格式不正确");
    }
    if (typeof body.apiKey === "string" && body.apiKey.length > 512) {
      throw new Error("AI Key 长度异常");
    }
    if (body.model != null && typeof body.model !== "string") {
      throw new Error("AI 模型名称格式不正确");
    }
    const result = await generateRules({
      description: body.description,
      maxRounds: Number(body.maxRounds || 3),
      players: Number(body.players || 2),
      apiKey: typeof body.apiKey === "string" ? body.apiKey : undefined,
      model: typeof body.model === "string" ? body.model : undefined
    });
    return NextResponse.json({
      ...result,
      rulesHash: hashArtifact(result.spec)
    });
  } catch (error) {
    return apiError(error);
  }
}

