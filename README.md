# Rule pact 赛约

面向竞赛参与者的自动裁判与 Monad 公证应用。参与者先通过钱包签名确认身份，再让 AI 把自然语言赛制编译成可读、可校验的规则 DSL；规则确认后，自动裁判逐局汇总数据、判定结束条件和胜负。规则、每局证据、最终结果和异议分别形成哈希，并由参与者钱包提交到 Monad 测试网登记合约。

## 已实现需求

| 需求 | 实现 |
| --- | --- |
| Monad 钱包身份识别 | 浏览器钱包连接、一次性挑战消息、EIP-191 签名验证、HttpOnly 会话 |
| 描述比赛生成规则 | 可选 OpenAI 生成结构化规则；无 Key 时使用内置确定性编译器 |
| 规则总结与检阅 | 规则摘要、自然语言解释、哈希、参与人数与局数预览 |
| 最终确认 | 只有点击确认后才创建独立比赛 ID；规则内容随后不可原地修改 |
| 开设比赛与多人邀请 | 指定钱包专属邀请、邀请接受、参与者集合锁定 |
| 自动裁判 | 服务端受控规则引擎；数据全部到齐后才计分，支持提前结束和平局 |
| 每局独立证据 | 每次提交有数据哈希，每轮完成有轮次哈希，可逐一上链 |
| Monad 公证 | 规则、开局、轮次、结果与异议分别记录到 `CompetitionRegistry` |
| 链上历史结果 | 存储独立比赛 ID、规则哈希、参与者集合承诺、胜者、结果哈希、证据 URI |
| 结果异议 | 仅比赛参与者可提交一次异议；保留钱包、原因、原因哈希和链上交易 |
| 历史战绩与胜率 | 按已结合比赛统计场次、胜、负、平、胜率与历史结果 |

需求中重复出现的 Story4 被拆分为“自动裁判”和“链上历史结果”两个独立模块。

## 技术结构

```text
rulepact-monad/
├── web/                         Next.js 16 + React + wagmi + viem
│   ├── src/app/api/             认证、规则、比赛、邀请、异议、链上确认 API
│   ├── src/lib/rules/           Schema、编译器、确定性裁判、哈希
│   ├── src/lib/services/        比赛生命周期与战绩
│   └── scripts/smoke.mjs        双钱包全流程端到端测试
├── contracts/                   Hardhat + OpenZeppelin Solidity
│   ├── contracts/               CompetitionRegistry.sol
│   └── test/                    合约权限、轮次、结算、异议测试
├── outputs/                     最终交付压缩包
└── .monskills                   Monad testnet 构建标记
```

链上不保存大量原始比赛数据。链上保存不可篡改的承诺，原始数据和可检索历史保存在应用数据层。这符合“规则先锁、证据可核对、结果可追溯”的目标，也避免把整场比赛搬上链。

## 规则 DSL 的安全边界

AI 只能返回结构化 JSON，不能返回并执行 JavaScript。服务端用 Zod 校验：

- 最多 8 名参与者、99 局、8 个输入字段；
- 计分规则只能引用本局输入；
- 结束条件只能引用 `字段.aggregation` 或 `points`；
- 比较操作仅支持 `eq/neq/gt/gte/lt/lte/in`；
- 数字范围、枚举值、重复字段和未知字段均会拒绝；
- 规则确认前计算规范化 JSON 的 Keccak-256 哈希。

因此，即使模型输出恶意或错误内容，也只会得到“校验失败”，不会获得任意代码执行能力。

## 本地运行

要求 Node.js 20 或更高版本。

```bash
npm install
cp web/.env.example web/.env.local
```

至少修改 `web/.env.local`：

```dotenv
SESSION_SECRET=使用 openssl rand -hex 32 生成的随机值
FAIRPLAY_ALLOW_LOCAL_CHAIN=true
```

启动：

```bash
npm run dev
```

浏览器打开 `http://localhost:3100`。本地模式可完整验证钱包签名、规则、邀请、自动裁判、异议与战绩；配置登记合约后才能执行 Monad 链上操作。

### 在页面中填写 AI Key

工作台的“AI 规则引擎”区域提供 `OpenAI API Key` 输入框和模型名称输入框。Key 的处理规则：

- 只保存在当前 React 页面内存，不写入 `localStorage`、`sessionStorage`、数据库或源码；
- 仅在点击“让 AI 生成并检阅规则”时，随该次 HTTPS 请求临时发送到本项目服务端；
- 服务端只把它放入当次上游请求的 `Authorization` 头，不返回、不持久化、不写日志；
- 页面刷新或关闭后需要重新填写；
- 不填写时，服务端会依次尝试环境变量 `OPENAI_API_KEY` 和本地确定性编译器。

如果希望固定使用服务端密钥，可在 `web/.env.local` 中配置：

```dotenv
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
```

## 测试

```bash
npm run typecheck
npm run test:unit
npm run test:contract
npm test
```

当前覆盖：

- 规则编译、Schema 校验、字段越权与无效输入；
- 正常计分、提前结束、最低值获胜、真实平局、重复提交；
- 规范化哈希对对象键顺序不敏感；
- 钱包挑战、会话签名、篡改与过期拒绝；
- 邀请接受前不能开局、非参与者不能提交、完整比赛到异议与胜率；
- Solidity 合约参与者重复、轮次顺序、权限、结算和每钱包一次异议。

端到端冒烟测试会生成两个临时钱包并走完真实 HTTP 流程：

```bash
npm run build
SESSION_SECRET=smoke-session-secret-at-least-32-characters \
FAIRPLAY_ALLOW_LOCAL_CHAIN=true \
FAIRPLAY_DATA_DIR="$(mktemp -d)" \
npm run start -w web

# 另开终端
SMOKE_BASE_URL=http://localhost:3100 npm run smoke -w web
```

## 部署 Monad 测试网合约

1. 复制合约环境变量：

```bash
cp contracts/.env.example contracts/.env
```

2. 在 `contracts/.env` 填写专用测试钱包的 `DEPLOYER_PRIVATE_KEY`。不要使用主钱包，也不要提交该文件。

3. 部署：

```bash
npm run deploy:testnet -w contracts
```

4. 将输出地址写入 `web/.env.local`：

```dotenv
NEXT_PUBLIC_REGISTRY_ADDRESS=0x部署地址
NEXT_PUBLIC_MONAD_RPC_URL=https://testnet-rpc.monad.xyz
FAIRPLAY_ALLOW_LOCAL_CHAIN=false
```

5. 编译产物位于 `contracts/artifacts/contracts/CompetitionRegistry.sol/CompetitionRegistry.json`。部署后应在 `https://testnet.monadscan.com` 验证源码，并把合约地址及构造函数参数（部署者地址）作为验证输入。

应用没有预置任何“官方”登记合约地址。每个部署者必须先自行部署，避免误连未知合约。

## 生产建议

当前持久化使用单进程原子 JSON 文件，适合竞赛原型和小规模单实例部署。多人并发或正式生产环境应把 `Store` 接口替换为 PostgreSQL，并为写入加事务和唯一约束。

其他建议：

- `SESSION_SECRET` 使用独立随机值，至少 32 字节；
- `FAIRPLAY_ALLOW_LOCAL_CHAIN=false`，禁止无链上公证开局；
- RPC 使用付费或受监控的 Monad 测试网节点；
- AI 服务故障时继续使用内置编译器，不阻断比赛创建；
- 对链上确认任务做后台重试，前端只提交已确认 receipt；
- 邀请令牌只存 SHA-256 哈希，生产日志中不要记录原始邀请 URL；
- 合约审计与升级策略应在真实资金或高价值竞赛上线前完成。

## Monad gas 注意事项

本项目按 Monad 的计费方式理解成本：交易费用与设置的 `gas limit` 有关，而不只是实际消耗。前端因此不主动设置夸张 gas limit。上线前应分别测量 `createCompetition`、`startCompetition`、`recordRound`、`finalizeCompetition` 和 `raiseDispute` 在目标网络上的紧致估算值。
