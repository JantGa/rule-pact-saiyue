"use client";

import { ArrowRight, ShieldCheck, Swords } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { PublicCompetition } from "@/lib/domain/types";
import { useSession } from "@/hooks/use-session";
import { apiFetch, formatDate, shortAddress, statusLabel } from "@/lib/ui";

export function HomeDashboard({ createSlot }: { createSlot: ReactNode }) {
  const session = useSession();
  const [matches, setMatches] = useState<PublicCompetition[]>([]);
  const [error, setError] = useState("");

  async function load() {
    try {
      const data = await apiFetch<{ competitions: PublicCompetition[] }>("/api/competitions");
      setMatches(data.competitions);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "赛局加载失败");
    }
  }

  useEffect(() => {
    void load();
  }, [session.data?.authenticated]);

  const actor = session.data?.actor;
  const mine = actor
    ? matches.filter(
        (match) =>
          match.creator === actor ||
          match.participants.some((participant) => participant.address === actor)
      )
    : matches;

  if (!session.data?.authenticated) {
    return (
      <section className="shell section" id="workspace">
        <div className="card" style={{ padding: 28 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 24,
              alignItems: "center"
            }}
          >
            <div>
              <div className="card-kicker">Identity first</div>
              <h2
                style={{
                  fontFamily: "Georgia, serif",
                  fontSize: 32,
                  fontWeight: 500,
                  margin: "6px 0 8px"
                }}
              >
                先验证钱包，再建立你的比赛记录
              </h2>
              <p className="muted" style={{ margin: 0, lineHeight: 1.7 }}>
                签名只用于身份验证，不会发起转账。验证后可创建比赛、接受邀请并查询个人战绩。
              </p>
            </div>
            <button
              className="primary-button"
              type="button"
              onClick={() => document.getElementById("wallet-action")?.click()}
            >
              连接并验证 <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </section>
    );
  }

  const stats = session.data.stats;
  return (
    <section className="shell" id="workspace">
      <div className="app-hero">
        <div>
          <span className="eyebrow">Referee workspace</span>
          <h1>今天，由规则说话。</h1>
          <p>建立新赛局，或者继续处理正在进行中的比赛。</p>
        </div>
        <div className="wallet-identity">
          <small>已验证的 Monad 身份</small>
          <b>
            <span className="status-dot verified" />
            {shortAddress(actor || "", 7)}
          </b>
        </div>
      </div>
      <div className="dashboard-grid">
        {createSlot}
        <aside className="detail-stack">
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-kicker">Your record</div>
                <h2>个人战绩</h2>
              </div>
              <Swords size={18} />
            </div>
            <div className="card-body">
              <div className="stats-row">
                <div className="stat-box">
                  <b>{stats?.played ?? 0}</b>
                  <small>总场次</small>
                </div>
                <div className="stat-box">
                  <b>{stats?.wins ?? 0}</b>
                  <small>胜场</small>
                </div>
                <div className="stat-box">
                  <b>{stats?.ties ?? 0}</b>
                  <small>平局</small>
                </div>
                <div className="stat-box">
                  <b>{stats?.winRate ?? 0}%</b>
                  <small>胜率</small>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-kicker">Match archive</div>
                <h2>我的比赛</h2>
              </div>
              <span className="mini-pill">{mine.length} 场</span>
            </div>
            <div className="card-body">
              {error ? <div className="error-banner">{error}</div> : null}
              {mine.length ? (
                <div className="match-list">
                  {mine.slice(0, 8).map((match) => (
                    <Link className="match-row" href={`/match/${match.id}`} key={match.id}>
                      <div>
                        <div className="match-title-line">
                          <b>{match.title}</b>
                          <span className="status-pill">{statusLabel(match.status)}</span>
                        </div>
                        <div className="match-meta">
                          {match.participants.length} 人 · {formatDate(match.updatedAt)} ·{" "}
                          {match.chain.createTxHash ? "链上已锚定" : "本地规则"}
                        </div>
                      </div>
                      <ArrowRight size={16} />
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <ShieldCheck size={24} style={{ marginBottom: 9 }} />
                  <strong>还没有比赛</strong>
                  在上方描述你的第一场竞赛。
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

