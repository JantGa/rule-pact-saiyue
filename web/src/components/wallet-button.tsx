"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Check, LogOut, Wallet } from "lucide-react";
import { useState } from "react";
import { useAccount, useConnect, useDisconnect, useSignMessage } from "wagmi";
import { apiFetch, shortAddress, SESSION_EVENT } from "@/lib/ui";
import { useSession } from "@/hooks/use-session";

export function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const session = useSession();
  const queryClient = useQueryClient();
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState("");

  const verified = session.data?.authenticated && session.data.actor === address?.toLowerCase();

  async function handleClick() {
    setError("");
    if (!isConnected || !address) {
      const connector = connectors[0];
      if (!connector) {
        setError("未检测到浏览器钱包");
        return;
      }
      connect({ connector });
      return;
    }
    if (verified) {
      await apiFetch("/api/auth/logout", { method: "POST" });
      queryClient.setQueryData(["session"], {
        authenticated: false,
        actor: null,
        stats: null
      });
      window.dispatchEvent(new Event(SESSION_EVENT));
      return;
    }

    setIsVerifying(true);
    try {
      const challenge = await apiFetch<{ message: string }>("/api/auth/nonce", {
        method: "POST",
        body: JSON.stringify({ address })
      });
      const signature = await signMessageAsync({ message: challenge.message });
      await apiFetch("/api/auth/verify", {
        method: "POST",
        body: JSON.stringify({ address, signature })
      });
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      window.dispatchEvent(new Event(SESSION_EVENT));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "钱包验证失败");
    } finally {
      setIsVerifying(false);
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        id="wallet-action"
        type="button"
        className={`wallet-button ${isConnected ? "connected" : ""}`}
        onClick={handleClick}
        disabled={isConnecting || isVerifying}
        title={verified ? "点击退出当前验证" : error}
      >
        {verified ? <Check size={15} /> : <Wallet size={15} />}
        <span className="status-dot" style={{ background: verified ? undefined : "var(--violet)" }} />
        {isConnecting
          ? "连接中…"
          : isVerifying
            ? "等待签名…"
            : verified && address
              ? shortAddress(address)
              : isConnected
                ? "验证身份"
                : "连接 Monad 钱包"}
        {verified && session.data?.authenticated ? (
          <LogOut size={13} style={{ opacity: 0.55 }} />
        ) : null}
      </button>
      {error ? (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            zIndex: 30,
            width: 220,
            padding: 10,
            borderRadius: 9,
            background: "var(--ink)",
            color: "white",
            fontSize: 11,
            lineHeight: 1.5
          }}
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}

