# Oz Workspace 调研交接文档

> **日期**: 2026-04-22
> **状态**: 调研完成，待 Mobbin UX 研究（受限于模型不支持图片输入）
> **目的**: 为 automomo 从"全局 kanban 分配任务"转向"room 级别任务分配"提供设计参考

---

## 一、Oz Workspace 是什么

Warp 开源的协作式 AI Agent 工作台（Next.js 16 + Prisma + SQLite）。
本身不运行 Agent，作为**调度层和通信层**，通过 Warp Oz API 投递任务到云端 Docker 沙箱执行。

**仓库位置**: `/Users/randomradio/src/oz-workspace`
**关键源文件**:

| 文件 | 作用 |
|------|------|
| `lib/invoke-agent.ts` | 核心 Agent 调度（递归、prompt 组装、回调等待） |
| `lib/mention-dispatch.ts` | @mention 解析 → 按 harness 分类 dispatch |
| `lib/mentions.ts` | @mention 文本解析（支持空格、精确匹配） |
| `lib/agent-callback.ts` | 回调 payload 编解码 |
| `lib/oz-client.ts` | Oz SDK 封装（runAgent, pollForCompletion） |
| `lib/openclaw.ts` | OpenClaw Agent 配置、token 管理 |
| `lib/agent-token-auth.ts` | Bearer token 鉴权 |
| `lib/warp-artifacts.ts` | Warp 产出物（PR、Plan）持久化 |
| `lib/event-broadcaster.ts` | SSE 实时推送（内存 / Redis Streams） |
| `lib/rate-limiter.ts` | Warp API 全局 300ms 串行队列 |
| `app/api/agent-response/route.ts` | Agent 回调接收 + 编排 fan-in 逻辑 |
| `app/api/messages/route.ts` | 消息创建 + @mention 触发调度 |
| `app/api/agent/mentions/poll/route.ts` | OpenClaw 轮询接口 |
| `app/api/agent/mentions/respond/route.ts` | OpenClaw 回复接口 |
| `prisma/schema.prisma` | 完整数据模型 |

---

## 二、多 Agent 协作机制

### 2.1 两种 Agent Harness

| Harness | 执行方式 | 通信模型 |
|---------|---------|---------|
| **oz** | Warp Oz API → 云端 Docker 沙箱 | 推模式：SDK 调用 + 回调 URL |
| **openclaw** | 自托管 Agent 进程 | 拉模式：poll → claim → respond/release 租约 |

### 2.2 @mention 驱动的任务分配

核心调度机制。用户或 Agent 在消息中 `@AgentName` 触发：

```
POST /api/messages
  → extractMentionedNames() 精确解析
  → getMentionDispatchTargets() 按 harness 分类
  → oz agents: after(() => invokeAgent())
  → openclaw agents: enqueueOpenClawMentions() 写入队列
```

### 2.3 递归 Agent-to-Agent 调度

Agent 回复包含 `@OtherAgent` → 二次调度：
- `invokeAgent()` 递归调用，`depth + 1`
- 最大 `MAX_DISPATCH_DEPTH = 20`
- 用 `AgentCallback` 表 `dispatch:{invId}:{agentId}` 做去重

### 2.4 Fan-out / Fan-in 编排

同时 @mention 2+ 个 Agent 自动进入编排：

```
数据模型:
  AgentOrchestration (leadRunId, status, followupRunId, deadlineAt)
  AgentOrchestrationChild (orchestrationId, agentId, runId, status)

流程:
  Lead Agent mentions A, B, C
    → 创建 Orchestration + 3 个 Child (dispatched)
    → 每个 child 完成后回调 /api/agent-response
    → 标记 child completed，检查剩余
    → 最后一个完成时:
       - 收集所有 child 回复
       - 拼接 followupPrompt 给 Lead
       - Lead 整合输出最终回复

去重: updateMany CAS 写入 followupRunId，只有第一个 callback 赢
防误触: sanitizeDelegateText() 将 @ 替换为 ＠
```

### 2.5 OpenClaw 租约轮询

```
Agent → POST /api/agent/mentions/poll (Bearer token)
     ← 返回 claimed mentions（含聊天上下文 + 租约 120s）
Agent → 处理任务
Agent → POST /api/agent/mentions/respond
     或 POST /api/agent/mentions/release
```

---

## 三、与 Warp 沙箱的 API 交互

### 3.1 SDK 实际路径

`node_modules/oz-agent-sdk/` — Stainless 自动生成的 REST 客户端

| SDK 方法 | HTTP | 路径 | 用途 |
|----------|------|------|------|
| `client.agent.run()` | POST | `/agent/run` | 提交任务到沙箱 |
| `client.agent.runs.retrieve()` | GET | `/agent/runs/{id}` | 查询运行状态 |
| `client.agent.runs.list()` | GET | `/agent/runs` | 列出历史 |
| `client.agent.runs.cancel()` | POST | `/agent/runs/{id}/cancel` | 取消运行 |
| `client.agent.list()` | GET | `/agent` | 列出可用 Skills |
| `client.agent.schedules.create()` | POST | `/agent/schedules` | 创建定时任务 |
| `client.agent.schedules.*()` | CRUD | `/agent/schedules/{id}` | 管理定时 |

### 3.2 `POST /agent/run` — AmbientAgentConfig

```typescript
{
  environment_id?: string      // Docker 沙箱 UID
  model_id?: string            // LLM 模型
  base_prompt?: string         // 自定义提示词
  skill_spec?: string          // "org/repo:path/SKILL.md"
  name?: string                // 配置名
  computer_use_enabled?: bool  // 计算机使用
  worker_host?: string         // "warp"=云端 | 其他=自托管
  mcp_servers?: {              // MCP 服务器配置
    [name: string]: {
      warp_id?: string         // Warp 托管 MCP
      command?: string         // stdio MCP
      args?: string[]
      url?: string             // HTTP/SSE MCP
    }
  }
}
```

### 3.3 CloudEnvironmentConfig (沙箱环境定义)

```typescript
{
  name: string
  docker_image?: string            // e.g. "ubuntu:latest"
  github_repos?: [{owner, repo}]   // 自动 clone
  setup_commands?: string[]        // 初始化命令
}
```

### 3.4 运行状态机

```
QUEUED → PENDING → CLAIMED → INPROGRESS → SUCCEEDED
                                         → FAILED
                                         → CANCELLED
```

### 3.5 双路结果回收

```
路径 A: 长轮询 pollForCompletion() — 最多 60 次 × 10s
路径 B: 回调 — Agent 用 send_message skill POST 到 callbackUrl

Oz Workspace 先等路径 B 的结果写入 Message 表（最多 30s），
等不到 fallback 到 AgentCallback 表，
再等不到用路径 A 的结果。
```

### 3.6 给 Agent 组装的完整 Prompt

```
Identity: "Your name is {agent.name}"
System Prompt: agent.systemPrompt
Callback: 必须用 send_message skill 回复
Tasks: 用 manage_tasks skill 操作 Kanban
Notifications: 用 send_notification skill 通知用户
Teammates: 可 @mention 的 agent 列表
Room: room.name + room.description
History: 最近 20 条消息
Request: 原始 prompt
```

---

## 四、Redis Streams 的原因

Vercel serverless 多实例 → 内存 pub/sub 跨实例不共享。
Redis Streams 提供：
- 持久化（离线订阅者可以回放）
- 游标断点续传（客户端传 cursor）
- 按 room key 隔离
- MAXLEN 保留最近 1000 事件

本地开发用 InMemoryBroadcaster（内存 Map），生产用 Redis。
**automomo 当前单实例不需要，但 event broadcaster 抽象值得参考。**

---

## 五、SDK 的作用

Stainless 自动生成的类型安全 REST 客户端：
- 类型推断（request + response 完整 TypeScript 类型）
- 内置重试（429/5xx 指数退避，默认 2 次）
- 认证管理（构造函数传 apiKey）
- 错误分类（APIError 子类映射 HTTP 状态码）

automomo 的 `packages/protocol` 已是类型层，可参考补充通用客户端。

---

## 六、automomo 现状对比

### 当前架构

```
Workspace: pnpm monorepo
  apps/api (Hono, port 8000)
  apps/daemon (轮询式远程 runtime)
  apps/web (Next.js App Router)
  packages/protocol (Zod schema + types)
  packages/pi-runtime (Pi Mono 执行适配器)
```

### 关键差距

| 维度 | Oz Workspace | automomo 现状 | 需要做的 |
|------|-------------|-------------|---------|
| 任务分配位置 | Room 级别（@mention 触发） | 全局 kanban → WorkItem | **转移到 Room 级别** |
| Agent 调度 | @mention → 自动创建 session | 无自动调度 | 加 mention dispatch |
| 编排 | Fan-out/fan-in + Orchestration 表 | 无 | 加编排状态机 |
| 实时推送 | SSE（内存/Redis） | 无实时（纯 fetch） | 加 SSE |
| Agent 通信 | 统一回调 + 轮询 | daemon lease + run-local 分裂 | 统一 lease 协议 |
| Session→Room 桥接 | Agent 回复自动广播到 Room | Session events 和 Room messages 隔离 | 加事件桥接 |
| 执行环境 | 云端 Docker（environment_id） | shell/docker/pi 分散 | 统一环境模板 |
| API 对齐 | 清晰的 Agent/Room/Runtime 分层 | Daemon/Runtime 概念重叠 | 清理收敛 |

---

## 七、收敛建议（优先级）

### P0: 基础能力

| # | 事项 | 参考 Oz |
|---|------|---------|
| 1 | **SSE 实时推送** | `event-broadcaster.ts` 内存版 + `useRealtime.ts` |
| 2 | **@mention 触发 Agent 调度** | `mention-dispatch.ts` + `mentions.ts` |
| 3 | **Room 级别任务板** | Oz 的 Room + Task 模型（backlog/in_progress/done） |

### P1: 架构统一

| # | 事项 | 参考 Oz |
|---|------|---------|
| 4 | **统一 runtime 通信协议**（去掉 run-local 特殊路径） | daemon lease 已够好 |
| 5 | **Session 事件桥接到 Room Message** | Oz 的 agent-response 自动广播 |
| 6 | **环境模板**（预装配 Docker） | `CloudEnvironmentConfig` |

### P2: 高级编排

| # | 事项 | 参考 Oz |
|---|------|---------|
| 7 | **Fan-out/fan-in 编排** | `AgentOrchestration` + `AgentOrchestrationChild` |
| 8 | **SDK 化 protocol 包** | `oz-agent-sdk` 的设计模式 |
| 9 | **Redis Streams**（多实例部署时） | `event-broadcaster.ts` Redis 版 |

---

## 八、Room 级别任务分配设计方向

### 核心思路变更

```
旧: 全局 WorkItem → OrchestrationRule → Session → Runtime
新: Room 内 @mention / 手动创建 → RoomTask/WorkItem → Session → Runtime
```

### 数据模型变更方向

```
当前:
  WorkItem (codebaseId, roomId?, status: open/ready/running/...)
  RoomTask (roomId, status: open/running/blocked/done/cancelled)

建议:
  WorkItem 保持为全局聚合视图（跨 room 可见）
  RoomTask 升级为 Room 内的主要任务单元
  Agent 通过 RoomTask 认领工作 → 自动创建 Session
  Session 产出物桥接回 Room Message
```

### UX 设计方向（待 Mobbin 研究确认）

Room Workspace 内的 tab 布局:
- **Chat Tab**: 人类 + Agent 消息流，@mention 触发调度
- **Board Tab**: Room 级别 kanban（RoomTask），支持拖拽状态变更
- **Sessions Tab**: Room 内活跃/历史的 Session 列表
- **Outcomes Tab**: Room 内的产出物列表

全局视图:
- Home 页面: Room 列表 + 各 Room 活跃任务数
- 全局 Board: 跨 Room 聚合，按 Room 分组

### Mobbin UX 研究关键词（待执行）

1. `kanban board` — 看板布局参考
2. `chat task` — 聊天+任务并存的布局
3. `team project board` — 团队项目看板
4. `slack notion` — chat + 文档/任务集成

### Mobbin / 业界 UX 研究结果（2026-04-22 补充）

> Mobbin 本站 403 需登录抓取，因此通过 Radix/shadcn/Linear 官方文档、Atlassian Design、Slack/Notion 产品文档等交叉验证。

**A. Typography**
- Linear 使用 Inter（为 13–14px 优化）；Radix 官方 scale：12/16, 14/20, 16/24, 18/26（size/line-height），字重 400/500/700
- 密集 B2B 面板基准 14px（非 16px），行高 1.4–1.5 正文 / 1.1–1.3 标题
- 正文保持 400；只有标题/强调用 500，避免 weight inflation（Yellowfin 反模式）

**B. 卡片密度**
- Radix spacing：4 / 8 / 12 / 16 / 24 / 32 / 40 / 48 / 64
- Atlassian：紧凑 UI 用 0–8px，宽松 UI 用 12–24px，统一 8-point 基准
- Kanban 卡片实用参数：padding 12×12（紧凑）/ 12×16（舒适），卡片间 gap 8，列宽下限 260–280px

**C. 列头**
- Title Case 或大写，12–13px / 500–600，后跟无背景的 muted count
- Linear 2024 改版去掉竖直分隔线，改用背景色调+间距区分列

**D. 卡片结构（Linear / Height 共识）**
- Top row: ID / status icon
- Title: 2 行截断，14/500
- Bottom row: label chips (左) · date/estimate · assignee avatar (右)
- **Linear 明确不在卡片上展示 description**（卡片是扫描用的标识，不是预览）
- 状态切换通过 **列拖拽 / 右键菜单 / ⌘K**，**不**在卡片内嵌 `<select>`

**E. 空状态**
- 结构：headline (<10 字) → 1 句描述 → 可选 CTA
- 拷贝：避免 "No data"，用产品语（如 "Nothing here yet — @mention an agent"）
- 视觉：Linear/Notion 用 64–96px 单色小图标（非英雄插画）
- Carbon 规范：垂直居中于容器

**F. Chat + Task 混合布局**
- Height / Linear 首选 **Tab 切换**（Chat / Board / Sessions），避免同屏分屏的认知撕裂
- 输入框底部 sticky，高 z-index（响应速度提升 ~40%）
- **Slack 通知双层信号**：灰点=unread / 红数字徽章=@mention，用户已形成肌肉记忆
- Notion mention → 富链接 chip；评论打开侧面板

**G. 反模式清单**
- 多字号多字重（上限 3–4 字号 / 3 字重）
- 卡片内 inline `<select>` 修改状态
- 多色强调互相竞争（Linear 2024 显式减配色）
- 大型英雄插画作为空状态
- 卡片展示 description（冗余，挤占扫描带宽）
- 混用 12px padding 和 16px gutter

**核心参考链接**
- Radix Typography: https://www.radix-ui.com/themes/docs/theme/typography
- Radix Spacing: https://www.radix-ui.com/themes/docs/theme/spacing
- Linear redesign: https://linear.app/now/how-we-redesigned-the-linear-ui
- Linear board layout: https://linear.app/docs/board-layout
- Atlassian Spacing: https://atlassian.design/foundations/spacing
- Inter (rsms): https://rsms.me/inter/
- Slack notifications: https://slack.com/help/articles/360025446073
- Notion mentions: https://www.notion.com/help/comments-mentions-and-reminders

---

## 十一、automomo 当前 UI 诊断（2026-04-22）

阅读 `apps/web/src/app/globals.css`（2125 行）+ Room 相关组件后，与上述基准对比发现的 10 个问题：

| # | 问题 | 现状 | 基准 |
|---|------|------|------|
| 1 | 字号无 scale | 使用 11/12/13/14/15/16/18/22/24/32/34px 共 11 种 | 应压缩到 5 档（11/12/13/15/20） |
| 2 | 字重无规则 | 400/500/600/700 混用 | 400 正文 + 600 标题，其他极少用 |
| 3 | 字体栈 | `Avenir Next, Helvetica Neue, Arial` — 仅 macOS 有 Avenir | 应用 Inter（Linear 同款），或 system-ui |
| 4 | spacing 魔数 | 2/3/4/5/6/7/8/10/11/12/14/16/18/20/22/30 共 16 种 | 应用 4/8/12/16/24/32 六档 |
| 5 | Kanban 卡片过重 | 每张卡片包含：标题、description、source/status 文本、labels、**select+Update 表单**，共 5 行 | Linear 范本：标题 + 单行 meta，无 description，无 inline select |
| 6 | 状态三重表达 | 同时用列位置 + `status: X` 文本 + `<select>` 默认值 | 仅靠列位置 |
| 7 | 三种黄色冲突 | `--yellow:#eff51a`（focus）、`#fbffd3`（mention）、`#fff4cf`（status badge） | 单一 accent |
| 8 | Avatar/mark 四种风格 | `.ui-avatar` / `.message-avatar` / `.room-directory-mark` / `.asset-thumb` 形状+尺寸各异 | 统一 1 种 28×28 圆形 + 1 种 sq 24×24 room monogram |
| 9 | Chat hover 整行换色 | `.message-row:hover { background: var(--surface-subtle) }` | 仅显示右侧 action 图标 |
| 10 | `--font-mono` 未定义 | CSS 引用但 `:root` 没声明 → 静默回退 | 补声明 或 删除引用 |

### 核心视觉层级问题

Room 详情页当前纵向层级：
```
Room header 52px, h1 18px
  ↓
Tab bar ~45px
  ↓
Context (runtime panel)
  ↓
.floor-heading h2 "Room chat 12" 48px tall, 22px font  ← 比 room title 还大！
```
→ `.floor-heading` 在 Tab 内是冗余标题，Tab label 本身就是 section heading，应删除或改为 14px muted 计数。

### Kanban 卡片现状（`RoomWorkCard.tsx`）

```
┌─ title + priority badge
├─ "No description provided."
├─ source: pi | status: running
├─ [no labels] chip
├─ [Move to: select ▾] [Update]
└─ error?
```

Linear/Height 的做法：
```
┌─ AUT-42 · ●high
├─ Title (2-line clamp)
└─ [ui] · 2d · 🗨 3 · (avatar)
```
→ 去掉 description、source/status 文本、`<select>` 与 Update 按钮；拖拽或快捷菜单切换状态。

---

## 十二、建议 Token 方案（实施前待确认）

```css
:root {
  /* 字体 —— Inter（Linear/Vercel Geist 同源）*/
  --font-sans: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;

  /* Typography scale（Radix-flavored, Linear-tuned）*/
  --text-micro:  11px; --lh-micro:  16px;   /* 标签、badge */
  --text-small:  12px; --lh-small:  16px;   /* 次要文字、timestamp、meta */
  --text-body:   13px; --lh-body:   20px;   /* 默认正文（Linear 同款） */
  --text-emph:   14px; --lh-emph:   20px;   /* 卡片标题、强调 */
  --text-section:16px; --lh-section:24px;   /* Panel header */
  --text-page:   20px; --lh-page:   28px;   /* 页面 h1 */

  --weight-regular: 400;
  --weight-medium:  500;
  --weight-strong:  600;  /* 最高止步，删掉 700 的使用 */

  /* Spacing —— 4pt grid */
  --space-1: 4px;   --space-2: 8px;
  --space-3: 12px;  --space-4: 16px;
  --space-6: 24px;  --space-8: 32px;
  --space-12: 48px;

  /* Radius —— 压缩到 3 档 */
  --radius-sm: 4px; --radius-md: 6px; --radius-lg: 8px;

  /* Color accents —— 单一黄 + 分离语义色 */
  --accent:       #eff51a;       /* 仅 focus/brand */
  --mention-bg:   #f6fbe0;       /* chat 专用，降低饱和 */
  --warn-bg:      #fff4cf;       /* status pill 专用 */
  --warn-fg:      #8a6200;
  /* 其余保持不变 */
}
```

### 组件粒度变更

1. **`.room-work-card`**：
   - 删除 `<p>{body}</p>`、`source/status` meta span、inline `<select>` + Update `<form>`、`.room-work-card-error`（改为 toast）
   - 结构缩为：`<header>title + priority-dot</header>` + `<footer>labels · meta · avatar</footer>`
   - padding 12 12, gap 8, border-radius `--radius-md`

2. **列头**：font 12/600 大写 + muted count（无 pill 背景）；去掉 column `border-bottom`，靠背景 tint 区分

3. **`.floor-heading`**：Tab 内直接删除；仅在顶层页面保留为 `--text-section`/500（从 22px 降到 16px）

4. **`.message-row:hover`**：改为显示右侧操作区（reply/more），不改背景

5. **Empty state**：统一 component，结构 `<icon-24/> <h3 14/500> <p 13 muted>`，居中

6. **Status 通信**：使用 `●` 色点 + 文字，一处显示；拖拽或右键切换

7. **字体加载**：在 `apps/web/src/app/layout.tsx` 引入 Inter（`next/font/google`），避免 FOUT

### 预期影响范围
- `globals.css`：~60% token 重写（影响数十个 selector，机械替换）
- `RoomWorkCard.tsx`：删除 ~40 行，新增 ~20 行
- `RoomChatStream.tsx`：hover 样式、mention token 颜色
- `layout.tsx`：新增 Inter 字体加载
- 测试：`RoomWorkBoard.test.tsx`、`RoomOutcomesPanel.test.tsx` 断言文本可能需更新


---

## 九、与 automomo 现有代码的映射

| Oz 概念 | automomo 对应 | 文件 |
|---------|-------------|------|
| Room | Room（已有） | `packages/protocol/src/index.ts` RoomSchema |
| RoomAgent | RoomAgent（已有） | 同上 RoomAgentSchema |
| RoomMessage | RoomMessage（已有） | 同上 RoomMessageSchema |
| RoomTask (Oz) | RoomTask（已有，需升级） | 同上 RoomTaskSchema |
| Agent | Agent（已有） | 同上 AgentSchema |
| Runtime | Runtime（已有） | 同上 RuntimeSchema |
| Session | Session（已有） | 同上 SessionSchema |
| AgentOrchestration | **缺少** | 需新增 |
| AgentOrchestrationChild | **缺少** | 需新增 |
| AgentCallback | Lease（已有，可复用） | 同上 LeaseSchema |
| AgentMention | **缺少** | 需新增（OpenClaw 式 mention 队列） |
| event-broadcaster | **缺少** | 需新增（SSE 推送层） |

---

## 十、下一步行动

1. **Mobbin UX 研究**: 搜索上述关键词，截图分析 Room 级别看板的 UI 模式
2. **写实现计划**: 基于调研结果，制定 room-level task assignment 的改造计划
3. **协议变更**: 更新 `packages/protocol` 增加编排和 mention 相关 schema
4. **API 收敛**: 统一 runtime 通信协议，增加 mention dispatch
5. **SSE 推送**: 实现 event-broadcaster 和 useRealtime hook
