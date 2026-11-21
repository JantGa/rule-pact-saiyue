"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import type { Address } from "@/lib/domain/types";
import { apiFetch, SESSION_EVENT } from "@/lib/ui";

type MeResponse = {
  authenticated: boolean;
  actor: Address | null;
  stats: {
    played: number;
    wins: number;
    losses: number;
    ties: number;
    winRate: number;
  } | null;
};

export function useSession() {
  const query = useQuery({
    queryKey: ["session"],
    queryFn: () => apiFetch<MeResponse>("/api/auth/me"),
    staleTime: 5_000
  });

  useEffect(() => {
    const refresh = () => void query.refetch();
    window.addEventListener(SESSION_EVENT, refresh);
    return () => window.removeEventListener(SESSION_EVENT, refresh);
  }, [query]);

  return query;
}

