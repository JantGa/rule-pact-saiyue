"use client";

import {
  ArrowRight,
  BadgeCheck,
  Bot,
  FileCode2,
  Gavel,
  ShieldCheck,
  Sparkles,
  Swords
} from "lucide-react";
import Link from "next/link";
import { CreateCompetition } from "@/components/create-competition";
import { SiteHeader } from "@/components/site-header";
import { HomeDashboard } from "@/components/home-dashboard";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="shell hero">
          <div>
            <span className="eyebrow">Rule pact · 可信竞赛裁判</span>
            <h1>
              先对齐规则，
              <br />
              再让胜负<em>生效</em>。
            </h1>
            <p className="hero-copy">
              把比赛描述变成可检阅的赛约，让 AI 起草、参与者确认、自动裁判逐局执行，
              并由 Monad 为参与者、证据与最终结果留下不可篡改的时间线。
            </p>
            <div className="hero-actions">
              <button
                className="primary-button"
                type="button"
                onClick={() => document.getElementById("wallet-action")?.click()}
              >
                用 Monad 钱包进入 <ArrowRight size={15} />
              </button>
              <a className="secondary-button" href="#how-it-works">
                看看如何判分
              </a>
            </div>
          </div>
          <div className="orbit-card" aria-hidden="true">
            <div className="orbit-core">R</div>
            <div className="orbit-item one">
              <small>Rule hash</small>
              <b>0x7a91…ec20</b>
            </div>
            <div className="orbit-item two">
              <small>Round 03</small>
              <b>证据一致</b>
            </div>
            <div className="orbit-item three">
              <small>Monad</small>
              <b>已公证 ✓</b>
            </div>
            <span className="orbit-caption">RULES BEFORE SCORE</span>
          </div>
        </section>

        <div className="shell">
          <div className="trust-strip">
            <div className="trust-item">
              <small>身份</small>
              <b>钱包签名</b>
            </div>
            <div className="trust-item">
              <small>规则</small>
              <b>确定性 DSL</b>
            </div>
            <div className="trust-item">
              <small>公证</small>
              <b>Monad 测试网</b>
            </div>
            <div className="trust-item">
              <small>追溯</small>
              <b>逐局证据哈希</b>
            </div>
          </div>
        </div>

        <section className="shell section" id="how-it-works">
          <div className="section-heading">
            <div>
              <span className="eyebrow">How it works</span>
              <h2>从一句描述到可核验结果</h2>
            </div>
            <p>
              每个关键动作都有明确的输入与哈希。参与者能看懂规则，裁判只能执行已确认的版本。
            </p>
          </div>
          <div className="process-grid">
            <article className="process-step">
              <span className="process-number">01</span>
              <div className="process-icon">
                <Bot size={20} />
              </div>
              <h3>描述赛制</h3>
              <p>告诉 AI 参赛人数、每局数据、结束条件与胜负判断方式。</p>
            </article>
            <article className="process-step">
              <span className="process-number">02</span>
              <div className="process-icon">
                <FileCode2 size={20} />
              </div>
              <h3>检阅规则</h3>
              <p>摘要、解释、校验结果与规则哈希一起展示，确认前不改动比赛。</p>
            </article>
            <article className="process-step">
              <span className="process-number">03</span>
              <div className="process-icon">
                <Gavel size={20} />
              </div>
              <h3>自动判分</h3>
              <p>参与者逐局提交数据，全部到齐后由服务端唯一执行器结算。</p>
            </article>
            <article className="process-step">
              <span className="process-number">04</span>
              <div className="process-icon">
                <BadgeCheck size={20} />
              </div>
              <h3>链上留证</h3>
              <p>规则、开局、轮到、结果和异议分别锚定，历史随时可回查。</p>
            </article>
          </div>
        </section>

        <HomeDashboard createSlot={<CreateCompetition />} />

        <section className="shell section" id="why-monad">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Why Monad</span>
              <h2>不是把整场比赛搬上链</h2>
            </div>
            <p>
              原始对局数据保持可查询，链上只锚定承诺。既节省成本，也能验证“规则有没有被换掉”。
            </p>
          </div>
          <div className="process-grid">
            <article className="process-step">
              <span className="process-number">RULE</span>
              <div className="process-icon">
                <ShieldCheck size={20} />
              </div>
              <h3>规则先锁</h3>
              <p>开赛前记录规则哈希和参与者集合，比赛后无法悄悄改规矩。</p>
            </article>
            <article className="process-step">
              <span className="process-number">EVIDENCE</span>
              <div className="process-icon">
                <Swords size={20} />
              </div>
              <h3>逐局可回放</h3>
              <p>每局提交摘要形成证据哈希，输赢链路可以逐轮核对。</p>
            </article>
            <article className="process-step">
              <span className="process-number">RESULT</span>
              <div className="process-icon">
                <Sparkles size={20} />
              </div>
              <h3>结果成历史</h3>
              <p>胜者、结果摘要和证据哈希永久关联到独立比赛 ID。</p>
            </article>
            <article className="process-step">
              <span className="process-number">VOICE</span>
              <div className="process-icon">
                <Gavel size={20} />
              </div>
              <h3>异议不消失</h3>
              <p>反对意见由钱包身份署名并记录，与最终成绩同时保留。</p>
            </article>
          </div>
        </section>
      </main>
      <footer className="shell footer">
        <span>Rule pact 赛约 · 可信竞赛裁判</span>
        <span>规则可读 · 判分可复现 · 结果可追溯</span>
        <Link href="/">
          返回工作台 <ArrowRight size={12} style={{ verticalAlign: -2 }} />
        </Link>
      </footer>
    </>
  );
}

