"use client";

import {
  ArrowRight,
  Bot,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  Sparkles,
  WandSparkles
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { RuleSpec } from "@/lib/rules/schema";
import type { PublicCompetition } from "@/lib/domain/types";
import { apiFetch } from "@/lib/ui";

type InviteResult = { address: string; token: string; url: string };

export function CreateCompetition({ onCreated }: { onCreated?: () => void }) {
  const router = useRouter();
  const [description, setDescription] = useState(
    "两人进行三局两胜的桌上足球比赛。每局记录是否获胜和本局净胜球，累计赢两局者获胜。"
  );
  const [players, setPlayers] = useState(2);
  const [rounds, setRounds] = useState(3);
  const [invitees, setInvitees] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gpt-4.1-mini");
  const [showApiKey, setShowApiKey] = useState(false);
  const [draft, setDraft] = useState<{
    spec: RuleSpec;
    rulesHash: `0x${string}`;
    source: "ai" | "builtin";
    warning?: string;
  } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{
    competition: PublicCompetition;
    invites: InviteResult[];
  } | null>(null);

  async function generate() {
    setError("");
    setIsGenerating(true);
    setDraft(null);
    try {
      const result = await apiFetch<{
        spec: RuleSpec;
        rulesHash: `0x${string}`;
        source: "ai" | "builtin";
        warning?: string;
      }>("/api/rules/generate", {
        method: "POST",
        body: JSON.stringify({
          description,
          players,
          maxRounds: rounds,
          apiKey: apiKey.trim() || undefined,
          model: model.trim() || undefined
        })
      });
      setDraft(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "生成失败");
    } finally {
      setIsGenerating(false);
    }
  }

  async function confirmRules() {
    if (!draft) return;
    setError("");
    setIsCreating(true);
    try {
      const addresses = invitees
        .split(/[\n,，;；\s]+/)
        .map((address) => address.trim())
        .filter(Boolean);
      const result = await apiFetch<{
        competition: PublicCompetition;
        invites: InviteResult[];
      }>("/api/competitions", {
        method: "POST",
        body: JSON.stringify({
          description,
          title: draft.spec.title,
          spec: draft.spec,
          invitedAddresses: addresses
        })
      });
      setCreated(result);
      onCreated?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "创建失败");
    } finally {
      setIsCreating(false);
    }
  }

  if (created) {
    return (
      <div className="modal-backdrop">
        <div className="modal">
          <div className="result-eyebrow">RULES LOCKED</div>
          <h2>比赛已建立</h2>
          <p className="muted" style={{ lineHeight: 1.7 }}>
            规则和哈希已经固定。把专属链接发给队友，对方用自己的钱包验证身份后即可加入。
          </p>
          <div className="invite-links">
            {created.invites.length ? (
              created.invites.map((invite) => (
                <div className="invite-link" key={invite.address}>
                  <code>{invite.url}</code>
                  <button
                    className="copy-button"
                    type="button"
                    onClick={() => navigator.clipboard.writeText(invite.url)}
                  >
                    复制
                  </button>
                </div>
              ))
            ) : (
              <div className="success-banner" style={{ marginBottom: 0 }}>
                暂未邀请队友，可进入赛局后继续添加。
              </div>
            )}
          </div>
          <div className="form-actions">
            <span className="tiny muted mono">{created.competition.rulesHash.slice(0, 18)}…</span>
            <button
              className="primary-button"
              type="button"
              onClick={() => router.push(`/match/${created.competition.id}`)}
            >
              进入赛局 <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-kicker">01 / Define</div>
          <h2>描述赛制，让 AI 拟定赛约</h2>
        </div>
        <span className="source-pill">AI 生成 + 确定性裁判</span>
      </div>
      <div className="card-body">
        {error ? <div className="error-banner">{error}</div> : null}
        {draft?.warning ? <div className="error-banner">{draft.warning}</div> : null}
        <div className="ai-key-panel">
          <div className="ai-key-heading">
            <div className="ai-key-title">
              <span className="ai-key-icon">
                <Bot size={17} />
              </span>
              <div>
                <b>AI 规则引擎</b>
                <span>连接模型后，由 AI 把比赛描述编译成受控规则</span>
              </div>
            </div>
            <span className={`mini-pill ${apiKey ? "key-ready" : ""}`}>
              {apiKey ? "已填写当前页 Key" : "可留空"}
            </span>
          </div>
          <div className="field-grid ai-key-fields">
            <div className="field">
              <label htmlFor="ai-api-key">OpenAI API Key</label>
              <div className="secret-input">
                <KeyRound size={14} />
                <input
                  id="ai-api-key"
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder="sk-... 在这里填写你的 Key"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="secret-toggle"
                  onClick={() => setShowApiKey((value) => !value)}
                  aria-label={showApiKey ? "隐藏 API Key" : "显示 API Key"}
                >
                  {showApiKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <span className="field-help">
                仅保存在当前页面内存，不写入项目、数据库或浏览器存储。
              </span>
            </div>
            <div className="field">
              <label htmlFor="ai-model">AI 模型</label>
              <input
                id="ai-model"
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder="gpt-4.1-mini"
                autoComplete="off"
                spellCheck={false}
              />
              <span className="field-help">
                留空 Key 时，依次使用服务端 Key 和本地规则编译器。
              </span>
            </div>
          </div>
        </div>
        <div className="field-grid">
          <div className="field full">
            <label htmlFor="match-description">比赛描述</label>
            <textarea
              id="match-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="例如：两人进行五局三胜的飞镖比赛，每局记录环数和胜负，先赢三局者获胜。"
            />
            <span className="field-help">
              AI 会把自然语言编译成受控规则 DSL；不会执行模型生成的任意代码。
            </span>
          </div>
          <div className="field">
            <label htmlFor="players">参与人数</label>
            <select
              id="players"
              value={players}
              onChange={(event) => setPlayers(Number(event.target.value))}
            >
              {[2, 3, 4, 5, 6, 7, 8].map((value) => (
                <option key={value} value={value}>
                  {value} 人
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="rounds">最多局数</label>
            <input
              id="rounds"
              type="number"
              min={1}
              max={99}
              value={rounds}
              onChange={(event) => setRounds(Number(event.target.value))}
            />
          </div>
          <div className="field full">
            <label htmlFor="invitees">队友钱包（可稍后填写）</label>
            <textarea
              id="invitees"
              style={{ minHeight: 76 }}
              value={invitees}
              onChange={(event) => setInvitees(event.target.value)}
              placeholder="0x...（每行一个，或以逗号分隔）"
            />
          </div>
        </div>
        <div className="form-actions">
          <span className="privacy-note">
            确认后规则哈希不可更改。后续修改会产生新的比赛，而不是静默覆盖原规则。
          </span>
          <button
            className="primary-button"
            type="button"
            onClick={generate}
            disabled={isGenerating || description.trim().length < 10}
          >
            {isGenerating ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <WandSparkles size={15} />
            )}
            {isGenerating ? "AI 正在拟定赛约…" : "让 AI 生成并检阅规则"}
          </button>
        </div>

        {isGenerating ? <div className="loading-line mt-24" /> : null}
        {draft ? (
          <div className="rule-preview">
            <div className="rule-preview-title">
              <div>
                <div className="card-kicker">AI GENERATED RULES</div>
                <h3>{draft.spec.title}</h3>
                <span className="muted tiny">
                  {draft.spec.playerCount.min}-{draft.spec.playerCount.max} 人 · 最多{" "}
                  {draft.spec.maxRounds} 局
                </span>
              </div>
              <span className="source-pill">
                {draft.source === "ai" ? "AI 生成 · 已校验" : "规则引擎兜底 · 已校验"}
              </span>
            </div>
            <ul className="rule-summary-list">
              {draft.spec.summary.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="rule-explanation">{draft.spec.explanation}</p>
            <div className="hash-line">
              <Sparkles size={12} />
              <span>{draft.rulesHash}</span>
            </div>
            <div className="form-actions">
              <button className="ghost-button" type="button" onClick={generate}>
                重新生成
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={confirmRules}
                disabled={isCreating}
              >
                {isCreating ? <LoaderCircle size={15} className="spin" /> : null}
                {isCreating ? "正在建立比赛…" : "确认规则并创建比赛"}
                {!isCreating ? <ArrowRight size={15} /> : null}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

