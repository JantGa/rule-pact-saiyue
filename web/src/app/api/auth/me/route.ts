import { NextResponse } from "next/server";
import { currentActor } from "@/lib/http/api";
import { getPlayerStats } from "@/lib/services/competition-service";
import { getStore } from "@/lib/db/store";

export async function GET() {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ authenticated: false, actor: null, stats: null });
  return NextResponse.json({
    authenticated: true,
    actor,
    stats: await getPlayerStats(getStore(), actor)
  });
}

