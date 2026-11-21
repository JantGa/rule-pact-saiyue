import { describe, expect, it } from "vitest";
import { MemoryStore } from "@/lib/db/store";
import { generateRuleDraft } from "@/lib/rules/generator";
import {
  acceptInvite,
  createCompetition,
  getInvite,
  getPlayerStats,
  raiseDispute,
  startCompetition,
  submitRoundData
} from "./competition-service";

const alice = "0x1111111111111111111111111111111111111111" as const;
const bob = "0x2222222222222222222222222222222222222222" as const;

describe("competition lifecycle", () => {
  it("runs invitation, start, automatic judgement, dispute and stats", async () => {
    const store = new MemoryStore();
    const spec = generateRuleDraft({
      description: "两人进行一轮对决，记录胜负和得分。",
      maxRounds: 1,
      players: 2
    });
    const created = await createCompetition(store, {
      creator: alice,
      description: "两人进行一轮对决，记录胜负和得分。",
      spec,
      invitedAddresses: [bob]
    });
    expect(created.competition.status).toBe("inviting");
    expect(created.invites).toHaveLength(1);

    const inviteInfo = await getInvite(store, created.invites[0].token);
    expect(inviteInfo.address).toBe(bob);
    await acceptInvite(store, created.invites[0].token, bob);

    const started = await startCompetition(store, created.competition.id, alice);
    expect(started.status).toBe("active");
    expect(started.rounds[0].index).toBe(1);

    const waiting = await submitRoundData(
      store,
      created.competition.id,
      alice,
      { won: true, score: 9 }
    );
    expect(waiting.status).toBe("active");
    expect(waiting.rounds[0].submissions).toHaveLength(1);

    const completed = await submitRoundData(
      store,
      created.competition.id,
      bob,
      { won: false, score: 4 }
    );
    expect(completed.status).toBe("completed");
    expect(completed.result?.winners).toEqual([alice]);
    expect(completed.result?.evidenceHash).toMatch(/^0x[a-f0-9]{64}$/);

    const disputed = await raiseDispute(
      store,
      created.competition.id,
      bob,
      "第二局原始分数与现场记录不一致"
    );
    expect(disputed.disputes).toHaveLength(1);
    expect(disputed.disputes[0].participant).toBe(bob);

    const stats = await getPlayerStats(store, alice);
    expect(stats).toMatchObject({ played: 1, wins: 1, losses: 0, ties: 0, winRate: 100 });
    const bobStats = await getPlayerStats(store, bob);
    expect(bobStats).toMatchObject({ played: 1, wins: 0, losses: 1, winRate: 0 });
  });

  it("does not start before a designated wallet accepts", async () => {
    const store = new MemoryStore();
    const spec = generateRuleDraft({
      description: "验证参与者未接受邀请前不能开始比赛。",
      maxRounds: 2,
      players: 2
    });
    const created = await createCompetition(store, {
      creator: alice,
      description: spec.description,
      spec,
      invitedAddresses: [bob]
    });
    await expect(
      startCompetition(store, created.competition.id, alice)
    ).rejects.toThrow("尚未全部接受邀请");
  });

  it("prevents non-participants from submitting or disputing", async () => {
    const store = new MemoryStore();
    const outsider = "0x3333333333333333333333333333333333333333" as const;
    const spec = generateRuleDraft({
      description: "验证局外人不能提交比赛数据或异议。",
      maxRounds: 1,
      players: 2
    });
    const created = await createCompetition(store, {
      creator: alice,
      description: spec.description,
      spec,
      invitedAddresses: [bob]
    });
    await acceptInvite(store, created.invites[0].token, bob);
    await startCompetition(store, created.competition.id, alice);
    await expect(
      submitRoundData(store, created.competition.id, outsider, { won: true, score: 1 })
    ).rejects.toThrow("仅本场参与者");
    await expect(
      raiseDispute(store, created.competition.id, outsider, "局外人异议")
    ).rejects.toThrow("尚未结束");
  });
});

