"use client";

import { ArrowRight, Check, LoaderCircle, WalletCards } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Address } from "@/lib/domain/types";
import { useSession } from "@/hooks/use-session";
import { apiFetch, SESSION_EVENT } from "@/lib/ui";

type InviteInfo = {
  address: Address;
  expiresAt: string;
  accepted: boolean;
  competition: {
    id: `0x${string}`;
    title: string;
    creator: Address;
    rulesHash: `0x${string}`;
    status: string;
  };
};

export function InviteView({ token }: { token: string }) {
  const router = useRouter();
  const session = useSession();
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch<InviteInfo>(`/api/invites/${token}`)
      .then(setInvite)
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : "邀请加载失败")
      );
  }, [token]);

  async function accept() {
    setBusy(true);
    setError("");
    try {
      const competition = await apiFetch<{ id: string }>(
        `/api/invites/${token}/accept`,
        { method: "POST" }
      );
      window.dispatchEvent(new Event(SESSION_EVENT));
      router.push(`/match/${competition.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加入失败");
    } finally {
      setBusy(false);
    }
  }

  const actor = session.data?.actor;
  const isExpectedWallet = Boolean(actor && invite && actor === invite.address);

  return (
    <main className="shell" style={{ padding: "70px 0 100px", maxWidth: 780 }}>
      <Link className="back-link" href="/">
        返回首页
      </Link>
      <div className="card">
        <div className="card-body" style={{ padding: 38 }}>
          <span className="eyebrow">Wallet-gated invitation</span>
          <h1
            style={{
              fontFamily: "Songti SC, Georgia, serif",
              fontSize: "clamp(40px,7vw,64px)",
              fontWeight: 500,
              letterSpacing: "-.05em",
              margin: "18px 0 12px"
            }}
          >
            {invite?.competition.title || "正在读取邀请…"}
          </h1>
          {error ? <div className="error-banner">{error}</div> : null}
          {invite ? (
            <>
              <p className="muted" style={{ lineHeight: 1.75 }}>
                这是一份指定钱包的参赛邀请。只有下方地址可以接受，接受后你的身份会与该比赛永久关联。
              </p>
              <div className="rule-preview">
                <div className="rule-preview-title">
                  <div>
                    <div className="card-kicker">INVITED WALLET</div>
                    <h3 style={{ fontSize: 21, wordBreak: "break-all" }}>{invite.address}</h3>
                  </div>
                  <span className="source-pill">
                    {invite.accepted ? "已加入" : "等待接受"}
                  </span>
                </div>
                <div className="hash-line">
                  <WalletCards size={12} />
                  <span>{invite.competition.rulesHash}</span>
                </div>
              </div>
              {!session.data?.authenticated ? (
                <div className="form-actions">
                  <span className="privacy-note">
                    请先在右上角连接并验证被邀请的钱包，签名不会产生交易。
                  </span>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => document.getElementById("wallet-action")?.click()}
                  >
                    验证指定钱包 <ArrowRight size={15} />
                  </button>
                </div>
              ) : isExpectedWallet ? (
                <div className="form-actions">
                  <span className="privacy-note">
                    身份匹配成功。接受邀请后，创建者才能发起开局。
                  </span>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={invite.accepted ? () => router.push(`/match/${invite.competition.id}`) : accept}
                    disabled={busy}
                  >
                    {busy ? (
                      <LoaderCircle size={15} className="spin" />
                    ) : invite.accepted ? (
                      <Check size={15} />
                    ) : null}
                    {invite.accepted ? "进入比赛" : busy ? "正在加入…" : "接受邀请"}
                  </button>
                </div>
              ) : (
                <div className="error-banner mt-24">
                  当前验证钱包 {actor} 与邀请钱包不一致，请切换钱包后重新验证。
                </div>
              )}
            </>
          ) : (
            <div className="loading-line mt-24" />
          )}
        </div>
      </div>
    </main>
  );
}

