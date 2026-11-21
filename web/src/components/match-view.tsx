"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  CircleAlert,
  Copy,
  ExternalLink,
  Gavel,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  usePublicClient,
  useWalletClient
} from "wagmi";
import type { PublicCompetition } from "@/lib/domain/types";
import type { InputField } from "@/lib/rules/schema";
import {
  configuredRegistry,
  participantsCommitment,
  registryAbi
} from "@/lib/chain/registry";
import { useSession } from "@/hooks/use-session";
import {
  apiFetch,
  formatDate,
  shortAddress,
  SESSION_EVENT,
  statusLabel
} from "@/lib/ui";

type ChainFunction =
  | "createCompetition"
  | "startCompetition"
  | "recordRound"
  | "finalizeCompetition"
  | "raiseDispute";

export function MatchView({ matchId }: { matchId: string }) {
  const session = useSession();
  const { isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const queryClient = useQueryClient();
  const [match, setMatch] = useState<PublicCompetition | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [success, setSuccess] = useState("");
  const [inviteInput, setInviteInput] = useState("");
  const [inviteLinks, setInviteLinks] = useState<Array<{ address: string; url: string }>>([]);
  const [roundData, setRoundData] = useState<Record<string, string>>({});
  const [disputeReason, setDisputeReason] = useState("");

  const registry = configuredRegistry();
  const actor = session.data?.actor || null;
  const isCreator = match?.creator === actor;
  const isParticipant = Boolean(
    actor && match?.participants.some((participant) => participant.address === actor)
  );
  const activeRound = match?.rounds.at(-1);
  const myRoundSubmission = activeRound?.submissions.find(
    (submission) => submission.participant === actor
  );
  const hasDisputed = Boolean(match?.disputes.some((dispute) => dispute.participant === actor));

  async function load(silent = false) {
    if (!silent) setError("");
    try {
      const data = await apiFetch<PublicCompetition>(`/api/competitions/${matchId}`);
      setMatch(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "赛局加载失败");
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 6_000);
    return () => window.clearInterval(timer);
  }, [matchId]);

  async function chainWrite(
    functionName: ChainFunction,
    args: readonly unknown[]
  ): Promise<`0x${string}`> {
    if (!registry) throw new Error("未配置比赛登记合约，当前为本地演示模式");
    if (!walletClient || !publicClient) throw new Error("请先连接钱包");
    const hash = await walletClient.writeContract({
      address: registry,
      abi: registryAbi,
      functionName,
      args,
      account: walletClient.account
    } as never);
    await publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  async function confirmChain(
    action: "create" | "start" | "round" | "result" | "dispute",
    txHash: `0x${string}`,
    detail?: { roundIndex?: number; reasonHash?: `0x${string}` }
  ) {
    const updated = await apiFetch<PublicCompetition>(`/api/competitions/${matchId}/chain`, {
      method: "POST",
      body: JSON.stringify({ action, txHash, ...detail })
    });
    setMatch(updated);
  }

  async function notarizeRules() {
    if (!match) return;
    setBusy("rules");
    setError("");
    try {
      const txHash = await chainWrite("createCompetition", [
        match.id,
        match.rulesHash,
        match.participants.map((participant) => participant.address),
        `${window.location.origin}/match/${match.id}`
      ]);
      await confirmChain("create", txHash);
      setSuccess("规则与参与者集合已在 Monad 测试网公证。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "链上公证失败");
    } finally {
      setBusy("");
    }
  }

  async function startMatch() {
    if (!match) return;
    setBusy("start");
    setError("");
    try {
      let txHash: `0x${string}` | undefined;
      if (registry) {
        txHash = await chainWrite("startCompetition", [
          match.id,
          participantsCommitment(match.participants.map((participant) => participant.address))
        ]);
      }
      const updated = await apiFetch<PublicCompetition>(`/api/competitions/${matchId}/start`, {
        method: "POST",
        body: JSON.stringify(txHash ? { txHash } : {})
      });
      setMatch(updated);
      setSuccess(registry ? "开局哈希已上链，比赛开始。" : "本地演示比赛已开始。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "开局失败");
    } finally {
      setBusy("");
    }
  }

  async function invite() {
    setBusy("invite");
    setError("");
    try {
      const addresses = inviteInput
        .split(/[\n,，;；\s]+/)
        .map((address) => address.trim())
        .filter(Boolean);
      const result = await apiFetch<{
        competition: PublicCompetition;
        invites: Array<{ address: string; url: string }>;
      }>(`/api/competitions/${matchId}/invites`, {
        method: "POST",
        body: JSON.stringify({ addresses })
      });
      setMatch(result.competition);
      setInviteLinks((previous) => [...previous, ...result.invites]);
      setInviteInput("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "邀请失败");
    } finally {
      setBusy("");
    }
  }

  async function submitRound() {
    if (!match) return;
    setBusy("round");
    setError("");
    try {
      const data = Object.fromEntries(
        match.spec.inputFields.map((field) => {
          const raw = roundData[field.key];
          if (field.type === "number") return [field.key, Number(raw)];
          if (field.type === "boolean") return [field.key, raw === "true"];
          return [field.key, raw];
        })
      );
      const updated = await apiFetch<PublicCompetition>(`/api/competitions/${matchId}/rounds`, {
        method: "POST",
        body: JSON.stringify({ data })
      });
      setMatch(updated);
      setRoundData({});
      if (updated.status === "completed") {
        setSuccess("全部参与者数据到齐，自动裁判已生成最终结果。");
        await queryClient.invalidateQueries({ queryKey: ["session"] });
        window.dispatchEvent(new Event(SESSION_EVENT));
      } else {
        setSuccess("本轮数据已提交，等待其他参与者。");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "提交失败");
    } finally {
      setBusy("");
    }
  }

  async function notarizeRound(roundIndex: number, roundHash: `0x${string}`) {
    setBusy(`round-chain-${roundIndex}`);
    setError("");
    try {
      const txHash = await chainWrite("recordRound", [matchId, roundIndex, roundHash]);
      await confirmChain("round", txHash, { roundIndex });
      setSuccess(`第 ${roundIndex} 局证据哈希已上链。`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "轮次公证失败");
    } finally {
      setBusy("");
    }
  }

  async function notarizeResult() {
    if (!match?.result) return;
    setBusy("result-chain");
    setError("");
    try {
      const winner =
        match.result.outcome === "winner" ? match.result.winners[0] : "0x0000000000000000000000000000000000000000";
      const txHash = await chainWrite("finalizeCompetition", [
        match.id,
        match.result.evidenceHash,
        winner,
        `${window.location.origin}/match/${match.id}`
      ]);
      await confirmChain("result", txHash);
      setSuccess("最终胜负、结果哈希与证据摘要已上链。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "结果公证失败");
    } finally {
      setBusy("");
    }
  }

  async function dispute() {
    setBusy("dispute");
    setError("");
    try {
      const updated = await apiFetch<PublicCompetition>(`/api/competitions/${matchId}/disputes`, {
        method: "POST",
        body: JSON.stringify({ reason: disputeReason })
      });
      setMatch(updated);
      const lastDispute = updated.disputes.at(-1);
      if (registry && lastDispute) {
        const txHash = await chainWrite("raiseDispute", [matchId, lastDispute.reasonHash]);
        await confirmChain("dispute", txHash, { reasonHash: lastDispute.reasonHash });
      }
      setDisputeReason("");
      setSuccess(registry ? "异议已签名并记录到链上。" : "异议已记录，参与者和原因均可回查。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "异议提交失败");
    } finally {
      setBusy("");
    }
  }

  const steps = useMemo(() => {
    if (!match) return [];
    return [
      { label: "规则确认", active: true },
      { label: "队友加入", active: match.participants.every((item) => item.status === "active") },
      { label: "比赛执行", active: match.status === "active" || match.status === "completed" },
      { label: "结果公证", active: Boolean(match.result) }
    ];
  }, [match]);

  if (!match) {
    return (
      <main className="shell" style={{ padding: "80px 0" }}>
        <Link className="back-link" href="/">
          <ArrowLeft size={14} /> 返回工作台
        </Link>
        {error ? <div className="error-banner">{error}</div> : <div className="loading-line" />}
      </main>
    );
  }

  return (
    <main className="shell">
      <div className="detail-top">
        <Link className="back-link" href="/">
          <ArrowLeft size={14} /> 返回工作台
        </Link>
        <div className="detail-heading">
          <div>
            <span className="eyebrow">Match {match.id.slice(2, 8).toUpperCase()}</span>
            <h1>{match.title}</h1>
            <p>{match.description}</p>
          </div>
          <div style={{ display: "grid", gap: 9, justifyItems: "end" }}>
            <span className="status-pill">{statusLabel(match.status)}</span>
            <button
              type="button"
              className="ghost-button"
              onClick={() => void load()}
              disabled={Boolean(busy)}
            >
              <RefreshCw size={13} /> 刷新状态
            </button>
          </div>
        </div>
      </div>

      {!session.data?.authenticated ? (
        <div className="error-banner">
          当前为只读模式。要加入或提交数据，请先在右上角验证参与者钱包。
        </div>
      ) : null}
      {error ? <div className="error-banner">{error}</div> : null}
      {success ? <div className="success-banner">{success}</div> : null}
      {!registry && match.isLocalChainAllowed ? (
        <div
          className="mini-pill"
          style={{ marginBottom: 18, padding: "8px 12px", background: "rgba(118,85,232,.08)" }}
        >
          本地演示模式：判定链路可用，配置登记合约后启用 Monad 公证。
        </div>
      ) : null}
      {!registry && !match.isLocalChainAllowed ? (
        <div className="error-banner">
          当前部署没有配置 Monad 登记合约，比赛不能开局。请先部署合约并配置
          NEXT_PUBLIC_REGISTRY_ADDRESS。
        </div>
      ) : null}

      <div className="detail-layout">
        <div className="detail-stack">
          <section className="card">
            <div className="stepper">
              {steps.map((step, index) => (
                <div className={`step ${step.active ? "done" : ""}`} key={step.label}>
                  {String(index + 1).padStart(2, "0")} · {step.label}
                </div>
              ))}
            </div>
            <div className="card-body">
              <div className="card-kicker">Protocol state</div>
              <h2 style={{ margin: "5px 0 18px" }}>
                {match.status === "inviting"
                  ? "等待全部参与者验证钱包"
                  : match.status === "ready"
                    ? "参与者已到齐，等待公证与开局"
                    : match.status === "active"
                      ? `第 ${match.rounds.at(-1)?.index || 1} 局进行中`
                      : "比赛已完成自动判定"}
              </h2>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  alignItems: "center"
                }}
              >
                {match.status === "ready" && registry && !match.chain.createTxHash && isCreator ? (
                  <button
                    className="primary-button"
                    type="button"
                    onClick={notarizeRules}
                    disabled={!isConnected || Boolean(busy)}
                  >
                    {busy === "rules" ? <LoaderCircle size={15} className="spin" /> : <LockKeyhole size={15} />}
                    {busy === "rules" ? "等待链上确认…" : "公证规则与参与者"}
                  </button>
                ) : null}
                {match.status === "ready" &&
                isCreator &&
                (match.isLocalChainAllowed || match.chain.createTxHash) ? (
                  <button
                    className="primary-button"
                    type="button"
                    onClick={startMatch}
                    disabled={Boolean(busy) || (Boolean(registry) && !isConnected)}
                  >
                    {busy === "start" ? <LoaderCircle size={15} className="spin" /> : <Play size={15} />}
                    {busy === "start" ? "正在开局…" : "开始比赛"}
                  </button>
                ) : null}
                {match.chain.createTxHash ? (
                  <span className="mini-pill">
                    <ShieldCheck size={11} style={{ marginRight: 5 }} /> 规则已锚定
                  </span>
                ) : null}
                {match.chain.startTxHash ? (
                  <span className="mini-pill">
                    <Check size={11} style={{ marginRight: 5 }} /> 开局已锚定
                  </span>
                ) : null}
              </div>
            </div>
          </section>

          {match.status === "inviting" && isCreator ? (
            <section className="card">
              <div className="card-header">
                <div>
                  <div className="card-kicker">Invite with identity</div>
                  <h2>邀请参与者</h2>
                </div>
                <Link2 size={18} />
              </div>
              <div className="card-body">
                <div className="field">
                  <label htmlFor="new-invites">参与者钱包地址</label>
                  <textarea
                    id="new-invites"
                    style={{ minHeight: 76 }}
                    value={inviteInput}
                    onChange={(event) => setInviteInput(event.target.value)}
                    placeholder="0x...（每行一个）"
                  />
                </div>
                <div className="form-actions">
                  <span className="tiny muted">最多 {match.spec.playerCount.max} 人</span>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={invite}
                    disabled={!inviteInput.trim() || Boolean(busy)}
                  >
                    {busy === "invite" ? (
                      <LoaderCircle size={15} className="spin" />
                    ) : (
                      <Plus size={15} />
                    )}
                    生成邀请
                  </button>
                </div>
                {inviteLinks.length ? (
                  <div className="invite-links">
                    {inviteLinks.map((invite) => (
                      <div className="invite-link" key={invite.address + invite.url}>
                        <code>{invite.url}</code>
                        <button
                          type="button"
                          className="copy-button"
                          onClick={() => navigator.clipboard.writeText(invite.url)}
                        >
                          <Copy size={10} style={{ marginRight: 4 }} />
                          复制
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {match.status === "active" && activeRound ? (
            <section className="card">
              <div className="card-header">
                <div>
                  <div className="card-kicker">Round {String(activeRound.index).padStart(2, "0")}</div>
                  <h2>提交本轮数据</h2>
                </div>
                <span className="mini-pill">
                  {activeRound.submissions.length}/{match.participants.length} 已提交
                </span>
              </div>
              <div className="card-body">
                {!isParticipant ? (
                  <div className="empty-state">只有本场参与者可以提交数据。</div>
                ) : myRoundSubmission ? (
                  <div className="success-banner" style={{ marginBottom: 0 }}>
                    本轮数据已锁定，等待其余参与者提交。
                  </div>
                ) : (
                  <>
                    <div className="round-form">
                      {match.spec.inputFields.map((field) => (
                        <RoundField
                          field={field}
                          key={field.key}
                          value={roundData[field.key] || ""}
                          onChange={(value) =>
                            setRoundData((previous) => ({ ...previous, [field.key]: value }))
                          }
                        />
                      ))}
                      <div className="form-actions">
                        <span className="privacy-note">
                          所有参与者提交完成后立即执行已确认规则；本轮提交不可覆盖。
                        </span>
                        <button
                          className="primary-button"
                          type="button"
                          onClick={submitRound}
                          disabled={Boolean(busy)}
                        >
                          {busy === "round" ? (
                            <LoaderCircle size={15} className="spin" />
                          ) : (
                            <Gavel size={15} />
                          )}
                          提交给自动裁判
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </section>
          ) : null}

          {match.rounds.some((round) => round.complete) ? (
            <section className="card">
              <div className="card-header">
                <div>
                  <div className="card-kicker">Replayable evidence</div>
                  <h2>逐局判定记录</h2>
                </div>
                <span className="mini-pill">
                  {match.rounds.filter((round) => round.complete).length} 局
                </span>
              </div>
              <div className="card-body">
                <table className="score-table">
                  <thead>
                    <tr>
                      <th>轮次</th>
                      <th>提交</th>
                      <th>完成时间</th>
                      <th>证据哈希</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {match.rounds
                      .filter((round) => round.complete)
                      .map((round) => (
                        <tr key={round.index}>
                          <td>#{round.index}</td>
                          <td>{round.submissions.length} 人</td>
                          <td className="muted">{formatDate(round.completedAt || match.updatedAt)}</td>
                          <td>
                            <code className="tiny">{round.roundHash?.slice(0, 14)}…</code>
                          </td>
                          <td>
                            {round.chainTxHash ? (
                              <span className="status-pill">已锚定</span>
                            ) : isCreator && registry && match.chain.startTxHash ? (
                              <button
                                className="ghost-button"
                                type="button"
                                onClick={() =>
                                  round.roundHash && notarizeRound(round.index, round.roundHash)
                                }
                                disabled={Boolean(busy)}
                              >
                                {busy === `round-chain-${round.index}` ? (
                                  <LoaderCircle size={12} className="spin" />
                                ) : (
                                  <LockKeyhole size={12} />
                                )}
                                存证
                              </button>
                            ) : (
                              <span className="tiny muted">本地</span>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {match.result ? (
            <section className="card result-card">
              <div className="card-header">
                <div>
                  <div className="result-eyebrow">FINAL ATTESTATION</div>
                  <h2>最终判定</h2>
                </div>
                <span className="status-pill" style={{ background: "rgba(217,255,107,.12)", color: "var(--acid)", borderColor: "rgba(217,255,107,.25)" }}>
                  {match.result.outcome === "tie" ? "平局" : "已产生胜者"}
                </span>
              </div>
              <div className="card-body">
                <div className="result-title">
                  {match.result.outcome === "tie"
                    ? "双方战绩相同"
                    : match.result.winners
                        .map((winner) =>
                          winner === actor
                            ? "你"
                            : match.participants.find((item) => item.address === winner)?.address ===
                                match.creator
                              ? "创建者"
                              : shortAddress(winner)
                        )
                        .join(" / ") + " 获胜"}
                </div>
                <p className="result-note">
                  结束原因：{match.result.endedBy}。{match.result.summary}。
                </p>
                <table className="score-table" style={{ color: "white", marginTop: 18 }}>
                  <thead>
                    <tr>
                      <th style={{ color: "rgba(255,255,255,.45)" }}>参与者</th>
                      <th style={{ color: "rgba(255,255,255,.45)" }}>总分</th>
                      <th style={{ color: "rgba(255,255,255,.45)" }}>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {match.result.standings.map((standing) => (
                      <tr
                        className={match.result?.winners.includes(standing.participant) ? "winner-row" : ""}
                        key={standing.participant}
                      >
                        <td>{shortAddress(standing.participant)}</td>
                        <td>{standing.points}</td>
                        <td>
                          {match.result?.winners.includes(standing.participant) ? "胜" : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="evidence-list">
                  <div className="evidence-item">
                    <span>RULES HASH</span>
                    <code>{match.rulesHash}</code>
                  </div>
                  <div className="evidence-item">
                    <span>RESULT HASH</span>
                    <code>{match.result.evidenceHash}</code>
                  </div>
                  <div className="evidence-item">
                    <span>ONCHAIN RESULT</span>
                    <code>{match.chain.resultTxHash || "尚未上链"}</code>
                  </div>
                </div>
                {isCreator &&
                registry &&
                !match.chain.resultTxHash &&
                match.rounds.every((round) => !round.complete || round.chainTxHash) ? (
                  <button
                    className="primary-button mt-24"
                    type="button"
                    onClick={notarizeResult}
                    disabled={!isConnected || Boolean(busy)}
                  >
                    {busy === "result-chain" ? (
                      <LoaderCircle size={15} className="spin" />
                    ) : (
                      <ShieldCheck size={15} />
                    )}
                    {busy === "result-chain" ? "正在写入结果…" : "将最终结果写入 Monad"}
                  </button>
                ) : isCreator &&
                  registry &&
                  !match.chain.resultTxHash &&
                  match.rounds.some((round) => round.complete && !round.chainTxHash) ? (
                  <p className="result-note mt-24">
                    请先在上方为每一局证据完成链上存证，再写入最终结果。
                  </p>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="side-stack">
          <section className="card">
            <div className="card-header">
              <div>
                <div className="card-kicker">Verified players</div>
                <h2>参与者</h2>
              </div>
              <span className="mini-pill">{match.participants.length} 人</span>
            </div>
            <div className="card-body">
              <div className="participants">
                {match.participants.map((participant) => (
                  <div className="participant-row" key={participant.address}>
                    <div className="participant-info">
                      <span className="avatar">{participant.address.slice(2, 4).toUpperCase()}</span>
                      <div style={{ minWidth: 0 }}>
                        <div className="tiny" style={{ fontWeight: 700 }}>
                          {participant.address === match.creator
                            ? "创建者"
                            : participant.address === actor
                              ? "你"
                              : "参与者"}
                        </div>
                        <code>{shortAddress(participant.address, 6)}</code>
                      </div>
                    </div>
                    <span className="mini-pill">
                      {participant.status === "active" ? (
                        <>
                          <Check size={10} style={{ marginRight: 3 }} /> 已验证
                        </>
                      ) : (
                        "待加入"
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <div className="card-kicker">Confirmed rules</div>
                <h2>规则摘要</h2>
              </div>
              <LockKeyhole size={17} />
            </div>
            <div className="card-body">
              <ul className="rule-summary-list">
                {match.spec.summary.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <div className="hash-line">
                <Sparkles size={12} />
                <span>{match.rulesHash}</span>
              </div>
            </div>
          </section>

          {(match.status === "active" || match.status === "completed") ? (
            <section className="card">
              <div className="card-header">
                <div>
                  <div className="card-kicker">Live score</div>
                  <h2>当前积分</h2>
                </div>
                <ChevronRight size={17} />
              </div>
              <div className="card-body">
                <table className="score-table">
                  <tbody>
                    {match.participants.map((participant) => {
                      const latest = match.rounds
                        .filter((round) => round.complete)
                        .at(-1)
                        ?.scores.find((score) => score.participant === participant.address);
                      return (
                        <tr key={participant.address}>
                          <td>{shortAddress(participant.address)}</td>
                          <td style={{ textAlign: "right", fontWeight: 700 }}>{latest?.points ?? 0}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {match.result && isParticipant ? (
            <section className="card">
              <div className="card-header">
                <div>
                  <div className="card-kicker">Right to contest</div>
                  <h2>结果异议</h2>
                </div>
                <CircleAlert size={17} />
              </div>
              <div className="card-body">
                {match.disputes.length ? (
                  <div className="disputes">
                    {match.disputes.map((item) => (
                      <div className="dispute-item" key={item.id}>
                        <div className="tiny" style={{ fontWeight: 700 }}>
                          {item.participant === actor ? "你" : shortAddress(item.participant)}
                          {item.chainTxHash ? " · 已上链" : " · 已记录"}
                        </div>
                        <p>{item.reason}</p>
                        <div className="tiny muted mono">{item.reasonHash.slice(0, 24)}…</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted tiny">目前没有参与者提出异议。</p>
                )}
                {!hasDisputed ? (
                  <div className="field mt-16">
                    <label htmlFor="dispute-reason">保留一条异议</label>
                    <textarea
                      id="dispute-reason"
                      style={{ minHeight: 80 }}
                      value={disputeReason}
                      onChange={(event) => setDisputeReason(event.target.value)}
                      placeholder="具体说明你认为哪条规则或哪局数据有误…"
                    />
                    <button
                      className="danger-button mt-16"
                      type="button"
                      onClick={dispute}
                      disabled={disputeReason.trim().length < 4 || Boolean(busy)}
                    >
                      {busy === "dispute" ? (
                        <LoaderCircle size={14} className="spin" />
                      ) : (
                        <Gavel size={14} />
                      )}
                      提交并记录我的异议
                    </button>
                  </div>
                ) : (
                  <div className="success-banner mt-16" style={{ marginBottom: 0 }}>
                    你已提交本场异议，记录不可覆盖。
                  </div>
                )}
              </div>
            </section>
          ) : null}

          {registry ? (
            <a
              className="secondary-button"
              href={`https://testnet.monadscan.com/address/${registry}`}
              target="_blank"
              rel="noreferrer"
            >
              在 Monadscan 查看登记合约 <ExternalLink size={14} />
            </a>
          ) : null}
        </aside>
      </div>
    </main>
  );
}

function RoundField({
  field,
  value,
  onChange
}: {
  field: InputField;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="field">
      <label htmlFor={`round-${field.key}`}>
        {field.label}
        {field.required ? "" : "（可选）"}
      </label>
      {field.type === "boolean" ? (
        <select
          id={`round-${field.key}`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">请选择</option>
          <option value="true">是</option>
          <option value="false">否</option>
        </select>
      ) : field.type === "enum" ? (
        <select
          id={`round-${field.key}`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">请选择</option>
          {field.options?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={`round-${field.key}`}
          type={field.type === "number" ? "number" : "text"}
          min={field.min}
          max={field.max}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {field.description ? <span className="field-help">{field.description}</span> : null}
    </div>
  );
}

