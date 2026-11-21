import { privateKeyToAccount } from "viem/accounts";

const baseUrl = process.env.SMOKE_BASE_URL || "http://localhost:3100";

class WalletSession {
  constructor(privateKey) {
    this.account = privateKeyToAccount(privateKey);
    this.cookie = "";
  }

  async request(path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...options.headers
      }
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(`${methodLabel(options)} ${path}: ${payload.error || response.status}`);
    }
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";")[0];
    return payload;
  }

  async authenticate() {
    const challenge = await this.request("/api/auth/nonce", {
      method: "POST",
      body: JSON.stringify({ address: this.account.address })
    });
    const signature = await this.account.signMessage({ message: challenge.message });
    return this.request("/api/auth/verify", {
      method: "POST",
      body: JSON.stringify({ address: this.account.address, signature })
    });
  }
}

function methodLabel(options) {
  return options.method || "GET";
}

function assert(value, message) {
  if (!value) throw new Error(`断言失败：${message}`);
}

async function main() {
  const alice = new WalletSession(
    "0x0000000000000000000000000000000000000000000000000000000000000001"
  );
  const bob = new WalletSession(
    "0x0000000000000000000000000000000000000000000000000000000000000002"
  );

  await alice.authenticate();
  await bob.authenticate();
  console.log("✓ 两个 Monad 钱包完成消息签名认证");

  const generated = await alice.request("/api/rules/generate", {
    method: "POST",
    body: JSON.stringify({
      description: "两人进行三局两胜比赛，每局记录胜负与得分，先赢两局者获胜。",
      players: 2,
      maxRounds: 3
    })
  });
  assert(generated.spec.playerCount.max === 2, "规则人数");
  assert(/^0x[a-f0-9]{64}$/.test(generated.rulesHash), "规则哈希");
  console.log("✓ 规则生成、Schema 校验与规则哈希完成");

  const created = await alice.request("/api/competitions", {
    method: "POST",
    body: JSON.stringify({
      description: generated.spec.description,
      title: generated.spec.title,
      spec: generated.spec,
      invitedAddresses: [bob.account.address]
    })
  });
  const matchId = created.competition.id;
  assert(created.invites.length === 1, "指定钱包邀请");
  const inviteToken = created.invites[0].token;
  console.log(`✓ 独立比赛已创建：${matchId.slice(0, 14)}…`);

  const invite = await bob.request(`/api/invites/${inviteToken}`);
  assert(invite.address === bob.account.address.toLowerCase(), "邀请钱包匹配");
  const accepted = await bob.request(`/api/invites/${inviteToken}/accept`, {
    method: "POST"
  });
  assert(accepted.status === "ready", "所有参与者接受后进入待开局");
  console.log("✓ 被邀请钱包验证身份并接受邀请");

  const started = await alice.request(`/api/competitions/${matchId}/start`, {
    method: "POST",
    body: "{}"
  });
  assert(started.status === "active", "比赛开局");
  console.log("✓ 创建者点击开始，自动裁判进入第 1 局");

  const firstRound = await alice.request(`/api/competitions/${matchId}/rounds`, {
    method: "POST",
    body: JSON.stringify({ data: { won: true, score: 9 } })
  });
  const secondRound = await bob.request(`/api/competitions/${matchId}/rounds`, {
    method: "POST",
    body: JSON.stringify({ data: { won: false, score: 4 } })
  });
  assert(firstRound.status === "active" && secondRound.status === "active", "第一局完成并进入下一局");
  await alice.request(`/api/competitions/${matchId}/rounds`, {
    method: "POST",
    body: JSON.stringify({ data: { won: true, score: 7 } })
  });
  const completed = await bob.request(`/api/competitions/${matchId}/rounds`, {
    method: "POST",
    body: JSON.stringify({ data: { won: false, score: 5 } })
  });
  assert(completed.status === "completed", "比赛完成");
  assert(completed.result.winners[0] === alice.account.address.toLowerCase(), "自动胜负");
  assert(/^0x[a-f0-9]{64}$/.test(completed.result.evidenceHash), "结果证据哈希");
  console.log("✓ 两名参与者提交数据，自动判定胜者并生成证据哈希");

  const disputed = await bob.request(`/api/competitions/${matchId}/disputes`, {
    method: "POST",
    body: JSON.stringify({ reason: "现场分数记录与系统提交不一致" })
  });
  assert(disputed.disputes[0].participant === bob.account.address.toLowerCase(), "异议身份");
  console.log("✓ 参与者异议署名、原因与异议哈希已记录");

  const stats = await alice.request("/api/auth/me");
  assert(stats.stats.played === 1, "历史场次");
  assert(stats.stats.wins === 1, "历史胜场");
  assert(stats.stats.winRate === 100, "胜率");
  console.log("✓ 历史战绩与胜率查询通过");
  console.log("\nSMOKE_TEST_OK", JSON.stringify(stats.stats));
}

main().catch((error) => {
  console.error("\nSMOKE_TEST_FAILED", error);
  process.exitCode = 1;
});
