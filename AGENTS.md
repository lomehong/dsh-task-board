# dsh-task-board · 任务看板（系统层知识索引）

一句话定位：DeepSeek Harness 数字分身套件的任务中心化组件——Host 权威任务账本、cron 定时调度、真实分身会话执行、账本裁决闭环（TypeScript cordis 插件，ESM，含 React 客户端面板）。

src/ 结构速览：
- index.ts：宿主插件入口（HTTP 路由注册、provide('dsh-task-board') 活动服务、ledger/memory/im-channel/tools 惰性接线）
- service.ts：TaskBoardService（run/claim/tick、活动视图缓存、状态快照、CRUD 透传）
- ledger.ts：权威账本（$DSH_HOME/dsh-task-board/ledger.json 原子写、任务 CRUD、列/运行状态类型）
- cron.ts + scheduler.ts：五字段 cron 解析与分钟级调度（同分钟去重、错过不补跑）
- runner.ts + gateway.ts + prompt.ts + goals.ts：分身投递与完成判定、typertGateway 封装、投递提示词、goal 播种/折叠
- governance.ts + report.ts + memory.ts：L0-L3 裁决与本地降级、自报/主人确认、记忆沉淀
- tools.ts：模型工具 task_report / task_delegate / task_claim / task_approve
- client/index.tsx：客户端看板面板（conversation.view + main/sidebar.panellist 双写）

.knowledge/ 索引：
- role.yaml：仓角色定位与能力清单（带 source）
- interfaces.yaml：服务 / HTTP / 模型工具 / 客户端面板接口清单
- dependencies.yaml：consumes / consumed_by 与降级语义
- constraints.yaml：状态机、红线、测试入口、兼容注意

状态语义：status: 待审核 = 未经主人确认，引用前请自行回源 sources。

红线指针：改动前读 E:\Development\Code\nodejs\digital-twin\docs\suite-charter.md。

构建与测试（package.json scripts）：
- npm install
- npm run build            # tsc -b tsconfig.json
- npm test                 # vitest run
- npm run typecheck        # tsc -b tsconfig.json --noEmit
- npm run build:client     # node scripts/build-client.mjs
- npm run typecheck:client # tsc -p tsconfig.client.json
