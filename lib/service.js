import { GatewayClient, sessionAddress } from './gateway.js';
import { TaskRunner } from './runner.js';
import { adjudicate, fillResult, ledgerAvailable } from './governance.js';
import { recordTaskOutcome } from './memory.js';
import { foldGoalFromRecords } from './goals.js';
import { loadBoard, transact, createTask, updateTask, setArchived, deleteTask, genId, MAX_RUNS_PER_TASK } from './ledger.js';
import { collectDueTasks } from './scheduler.js';
export class TaskBoardService {
    runner;
    gatewayClient;
    logger;
    tickTimer;
    tickIntervalMs;
    defaultWorkspaceId;
    launchRetries;
    retryBackoffMs;
    stuckRunTimeoutMs;
    ticking = false;
    activity = {
        at: new Date().toISOString(),
        runningTasks: [], freeSessions: [], goals: [], pendingApprovals: [], recentCompleted: [],
    };
    constructor(gateway, options = {}) {
        this.gatewayClient = new GatewayClient(gateway);
        this.runner = new TaskRunner(this.gatewayClient);
        this.tickIntervalMs = options.tickIntervalMs ?? 15_000;
        this.defaultWorkspaceId = options.defaultWorkspaceId !== undefined ? options.defaultWorkspaceId : undefined;
        this.launchRetries = Math.max(0, options.launchRetries ?? 0);
        this.retryBackoffMs = Math.max(0, options.retryBackoffMs ?? 500);
        this.stuckRunTimeoutMs = Math.max(60_000, options.stuckRunTimeoutMs ?? 21_600_000);
    }
    /**
     * 宿主启动对账（系统性修复：僵尸 run 卡死认领/上报）：会话是**进程本地**执行
     * 现场——上一进程遗留的「运行中」执行已随重启终止（turn 永远不会结束了）。
     * 一律结算为「已取消」，避免僵尸 run 卡死 task_claim 的并发防护与 task_report
     * 的防伪造校验。返回清理数量（供启动日志）。
     */
    settleOrphanedRuns() {
        let n = 0;
        transact((store) => {
            for (const t of store.tasks) {
                for (const r of t.runs) {
                    if (r.status === '运行中') {
                        r.status = '已取消';
                        r.finishedAt = new Date().toISOString();
                        r.summary = '宿主重启，执行现场终止；如仍需要请重新认领或执行';
                        t.lastStatus = '已取消';
                        if (t.column === '进行中')
                            t.column = '待办';
                        n++;
                    }
                }
            }
        });
        return n;
    }
    /** 宿主接线后启动 tick 循环；返回停止函数。 */
    start() {
        this.tickTimer = setInterval(() => { void this.tick(); }, this.tickIntervalMs);
        void this.refreshActivity().catch(() => { });
        return () => { if (this.tickTimer !== undefined)
            clearInterval(this.tickTimer); };
    }
    /**
     * 活动视图（主任拍板：看板 = 唯一活动权威）。
     * tick 周期刷新缓存；此处同步返回缓存——消费方（dsh-twin 活动区段）
     * 在 systemPrompt 组装时同步读取，绝无网络等待。
     */
    activityView() {
        return this.activity;
    }
    /**
     * 刷新活动视图：进行中任务的执行现场、待审批、最近完成、自由会话
     * （运行中且未归属任何任务的会话——经宿主 session/list 观察）。
     * 会话维度失败只降级该维度，不影响任务维度。公有：测试与宿主可直接触发。
     */
    async refreshActivity() {
        const at = new Date().toISOString();
        const tasks = loadBoard().tasks.filter(t => t.archived !== true);
        const runningTasks = [];
        const pendingApprovals = [];
        const sessionIds = new Set();
        for (const t of tasks) {
            for (const r of t.runs) {
                if (r.status === '运行中' && r.sessionId !== undefined) {
                    runningTasks.push({ taskId: t.id, title: t.title, sessionId: r.sessionId });
                    sessionIds.add(r.sessionId);
                }
            }
            const last = t.runs[t.runs.length - 1];
            if (last !== undefined && last.status === '待审批')
                pendingApprovals.push({ taskId: t.id, title: t.title });
        }
        const recentCompleted = tasks
            .filter(t => t.lastStatus === '成功' || t.lastStatus === '失败')
            .sort((a, b) => String(b.lastRunAt ?? '').localeCompare(String(a.lastRunAt ?? '')))
            .slice(0, 5)
            .map(t => {
            const last = t.runs[t.runs.length - 1];
            // filter 已保证 lastStatus ∈ {成功, 失败}
            const status = t.lastStatus === '成功' ? '成功' : '失败';
            return {
                taskId: t.id, title: t.title, status,
                ...(t.lastRunAt !== undefined ? { finishedAt: t.lastRunAt } : {}),
                ...(last?.summary !== undefined ? { summary: last.summary } : {}),
            };
        });
        const freeSessions = [];
        const goals = [];
        try {
            const res = (await this.gatewayClient.invoke('session', 'list'));
            for (const it of res.items ?? []) {
                if (it.running !== true || it.sessionId === undefined || sessionIds.has(it.sessionId))
                    continue;
                if (freeSessions.length >= 8)
                    break;
                freeSessions.push({ sessionId: it.sessionId, ...(it.title !== undefined && it.title !== '' ? { title: it.title } : {}) });
            }
        }
        catch { /* 会话维度降级：自由会话留空，任务维度照常 */ }
        // L1 自主目标汇聚（拍板 2：自由会话进活动视图）：对每个自由会话折叠 goal/change，
        // 只取进行中（active）的自主目标——objective 截断 40 字，封顶 3 条保护主任注意力。
        // High-1 修复：必须先 follow 取快照 cursor 再以它作 throughSeq 反向翻页——
        // throughSeq 是「截止序号」，传 0 只会拿到会话第一条事件（当初 goals 维度
        // 静默失效的根因）。单会话失败只降级该会话。
        for (const fs of freeSessions.slice(0, 3)) {
            try {
                let cursor;
                try {
                    const stream = await this.gatewayClient.stream('session', 'follow', { address: sessionAddress(fs.sessionId), maxMessages: 1 });
                    const it = stream[Symbol.asyncIterator]();
                    const next = await it.next();
                    if (typeof it.return === 'function')
                        await it.return();
                    const follow = next.done === true ? undefined : next.value;
                    if (follow !== undefined && follow.type === 'snapshot' && typeof follow.cursor === 'number')
                        cursor = follow.cursor;
                }
                catch { /* follow 失败：该会话跳过（比误报空闲更诚实） */ }
                if (cursor === undefined)
                    continue;
                const page = (await this.gatewayClient.invoke('session', 'page', {
                    request: { address: sessionAddress(fs.sessionId), throughSeq: cursor, maxMessages: 200 },
                }));
                const goal = foldGoalFromRecords(page.records ?? []);
                if (goal !== undefined && goal.status === 'current' && goal.phase === 'active') {
                    goals.push({
                        sessionId: fs.sessionId,
                        ...(fs.title !== undefined ? { title: fs.title } : {}),
                        objective: goal.objective.length > 40 ? `${goal.objective.slice(0, 40)}…` : goal.objective,
                        roundsStarted: goal.roundsStarted,
                        maxGoalRounds: goal.maxGoalRounds,
                    });
                }
            }
            catch { /* 单会话失败跳过 */ }
        }
        this.activity = { at, runningTasks, freeSessions, pendingApprovals, recentCompleted, goals };
    }
    /** 状态快照（浏览器异步视图的完整数据面）。governance.mode 供客户端渲染治理徽标。 */
    state() {
        const store = loadBoard();
        return {
            ...store,
            scheduler: this.lastTickAt !== undefined ? { lastTickAt: this.lastTickAt } : {},
            governance: { mode: ledgerAvailable() ? '账本' : '本地' },
        };
    }
    lastTickAt;
    /** 创建任务并按声明的动作级别做**预裁决**（安全审计 H1：所有级别一律落账本
     *  记录 + prompt 纳入 digest 审计——防"降级申报绕过治理"；L2 及以上立即产生
     *  审批令牌。账本缺席时不预裁决——由本地降级策略在执行时处理）。 */
    async createWithGovernance(input) {
        const task = createTask(input);
        if (ledgerAvailable()) {
            try {
                await adjudicate({
                    taskId: task.id,
                    actionType: task.actionType,
                    targetScope: task.targetScope,
                    actionLevel: task.actionLevel,
                    digest: `委托立项：${task.title}——${String(task.prompt).slice(0, 80)}`,
                });
            }
            catch { /* 账本瞬态错误延迟到执行时暴露 */ }
        }
        return task;
    }
    /** 执行任务：账本裁决 → 放行则投递分身会话。返回执行记录（含审批令牌时为待审批）。 */
    async run(taskId, trigger) {
        const startedAtMs = Date.now();
        const startedAtIso = new Date(startedAtMs).toISOString();
        // 1) 治理裁决（账本缺席时 adjudicate 走本地降级策略，不再抛错）
        let verdict;
        try {
            verdict = adjudicate({
                taskId,
                actionType: this.taskOf(taskId)?.actionType ?? '',
                targetScope: this.taskOf(taskId)?.targetScope ?? '',
                actionLevel: this.taskOf(taskId)?.actionLevel ?? 'L1',
            });
        }
        catch (e) {
            return this.recordRun(taskId, {
                id: genId('RUN'), startedAt: startedAtIso, status: '已阻断',
                trigger,
                ...(e instanceof Error ? { summary: e.message } : { summary: String(e) }),
            });
        }
        // 2) 阻断/拒绝：落审批令牌，不投递。本地降级的 L3 拒绝保留待办列（不落已失败
        //    ——任务本身合法，治理恢复后即可执行）
        if (!verdict.allowed) {
            return this.recordRun(taskId, {
                id: genId('RUN'), startedAt: startedAtIso, status: verdict.decision === '阻断' ? '待审批' : '已阻断',
                trigger,
                ...(verdict.recordId !== undefined ? { ledgerRecordId: verdict.recordId } : {}),
                ...(verdict.reason !== undefined ? { summary: verdict.reason } : {}),
            }, verdict.mode === '本地' ? { keepColumn: true } : undefined);
        }
        // 3) 放行：投递分身会话（本地降级时 summary 带降级标注，供主任审阅）
        const task = this.taskOf(taskId);
        if (task === undefined)
            throw new Error(`任务不存在: ${taskId}`);
        const run = {
            id: genId('RUN'), startedAt: startedAtIso, status: '运行中', trigger,
            ...(verdict.recordId !== undefined ? { ledgerRecordId: verdict.recordId } : {}),
            ...(verdict.reason !== undefined ? { summary: verdict.reason } : {}),
        };
        try {
            // 投递重试：仅针对 launch 传输失败（会话创建/投递抛错），按线性退避
            let sessionId;
            let goalSeeded = false;
            let lastError;
            for (let attempt = 0; attempt <= this.launchRetries; attempt++) {
                try {
                    const launched = await this.runner.launch(task, trigger);
                    sessionId = launched.sessionId;
                    goalSeeded = launched.goalSeeded;
                    lastError = undefined;
                    break;
                }
                catch (e) {
                    lastError = e;
                    if (attempt < this.launchRetries) {
                        await new Promise(resolve => setTimeout(resolve, this.retryBackoffMs * (attempt + 1)));
                    }
                }
            }
            if (lastError !== undefined || sessionId === undefined) {
                throw lastError instanceof Error ? lastError : new Error(String(lastError ?? '任务投递失败'));
            }
            run.sessionId = sessionId;
            run.goalSeeded = goalSeeded;
        }
        catch (e) {
            run.status = '失败';
            run.finishedAt = new Date().toISOString();
            run.summary = e instanceof Error ? e.message : String(e);
            return this.recordRun(taskId, run, { failColumn: true });
        }
        this.recordRun(taskId, run);
        return run;
    }
    /**
     * 认领执行（task_claim，主任拍板的对话闭环）：把调用会话绑定为任务的执行现场——
     * **不派发新会话**，模型在当前会话 inline 干活，完成后经 task_report 上报结算。
     *
     * 治理与 run 相同：认领即裁决（L1 开发类放行留痕；L2 无授权 → 待审批 + 令牌，
     * 主任批准后重新认领即放行；L3 拒绝）。同一任务不允许并发双运行。
     * 结算语义：claimed run 的 turn/end 不结算（等 task_report），滞留由 stuck 兜底。
     */
    claim(taskId, sessionId, trigger = '手动') {
        const startedAtMs = Date.now();
        const startedAtIso = new Date(startedAtMs).toISOString();
        const task = this.taskOf(taskId);
        if (task === undefined)
            throw new Error(`任务不存在: ${taskId}`);
        // 并发双运行防护（并发审查 Low-4）：已有运行中执行 → 拒绝重复认领
        if (task.runs.some(r => r.status === '运行中')) {
            return this.recordRun(taskId, {
                id: genId('RUN'), startedAt: startedAtIso, status: '已阻断', trigger,
                summary: '该任务已有运行中的执行——不能重复认领',
            });
        }
        let verdict;
        try {
            verdict = adjudicate({
                taskId, actionType: task.actionType, targetScope: task.targetScope, actionLevel: task.actionLevel,
                digest: `会话认领：${task.title}——${String(task.prompt).slice(0, 80)}`,
            });
        }
        catch (e) {
            return this.recordRun(taskId, {
                id: genId('RUN'), startedAt: startedAtIso, status: '已阻断', trigger,
                ...(e instanceof Error ? { summary: e.message } : { summary: String(e) }),
            });
        }
        if (!verdict.allowed) {
            return this.recordRun(taskId, {
                id: genId('RUN'), startedAt: startedAtIso, status: verdict.decision === '阻断' ? '待审批' : '已阻断',
                trigger,
                ...(verdict.recordId !== undefined ? { ledgerRecordId: verdict.recordId } : {}),
                ...(verdict.reason !== undefined ? { summary: verdict.reason } : {}),
            }, verdict.mode === '本地' ? { keepColumn: true } : undefined);
        }
        const run = {
            id: genId('RUN'), startedAt: startedAtIso, status: '运行中', trigger,
            sessionId,
            claimed: true,
            ...(verdict.recordId !== undefined ? { ledgerRecordId: verdict.recordId } : {}),
        };
        this.recordRun(taskId, run);
        return run;
    }
    /** tick：调度触发 + 运行中执行的结果判定。整体兜底 catch——任何单次失败
     *  （fs 抖动/网关挂起降级）都不允许以 unhandledRejection 击穿宿主进程（SRE H1）。 */
    async tick() {
        if (this.ticking)
            return;
        this.ticking = true;
        try {
            this.lastTickAt = new Date().toISOString();
            // a) cron 到点的任务触发（同分钟去重已由 collectDueTasks 保证）
            for (const task of collectDueTasks(new Date())) {
                await this.run(task.id, '定时').catch(() => { });
            }
            // b0) 滞留兜底（High-2）：运行中 run 超过阈值强制取消——宿主重启 disarmed、
            //  goal 被清除等场景下 goal 相位残留 active 会导致"永久进行中"，这里兜底收敛。
            const stuckCutoff = Date.now() - this.stuckRunTimeoutMs;
            const stuckList = [];
            for (const task of loadBoard().tasks) {
                for (const run of task.runs) {
                    if (run.status === '运行中' && Date.parse(run.startedAt) < stuckCutoff) {
                        stuckList.push({ taskId: task.id, run, sessionId: run.sessionId ?? '' });
                    }
                }
            }
            for (const s of stuckList) {
                const finished = {
                    ...s.run,
                    status: '已取消',
                    finishedAt: new Date().toISOString(),
                    summary: `执行疑似滞留（超过 ${Math.round(this.stuckRunTimeoutMs / 3_600_000)} 小时无终态），看板强制取消；如仍需要请重新执行`,
                };
                transact((s2) => {
                    const t = s2.tasks.find(x => x.id === s.taskId);
                    if (t === undefined)
                        return;
                    const idx = t.runs.findIndex(r => r.id === s.run.id);
                    if (idx >= 0 && t.runs[idx]?.status === '运行中')
                        t.runs[idx] = finished;
                    t.lastStatus = '已取消';
                    if (finished.finishedAt !== undefined)
                        t.lastRunAt = finished.finishedAt;
                });
                this.logger?.warn?.(`[dsh-task-board] 滞留执行已强制取消：${s.taskId}（会话 ${s.sessionId}）`);
            }
            // b) 运行中的执行做结果判定
            const store = loadBoard();
            for (const task of store.tasks) {
                const running = task.runs.filter(r => r.status === '运行中' && r.sessionId !== undefined);
                for (const run of running) {
                    const outcome = await this.runner.inspect(run.sessionId, Date.parse(run.startedAt), { goalSeeded: run.goalSeeded === true, deferTurnEnd: run.claimed === true });
                    this.logger?.info?.(`[dsh-task-board] inspect ${run.sessionId} → ${outcome.outcome}${'error' in outcome ? ` (${outcome.error})` : ''}${'goalPhase' in outcome && outcome.goalPhase !== undefined ? ` [goal:${outcome.goalPhase}]` : ''}`);
                    if (outcome.outcome === 'pending')
                        continue;
                    const finish = {
                        ...run,
                        status: outcome.outcome === 'succeeded' ? '成功' : outcome.outcome === 'failed' ? '失败' : '已取消',
                        finishedAt: new Date().toISOString(),
                        ...('error' in outcome && outcome.error !== undefined ? { summary: outcome.error } : {}),
                    };
                    transact((s2) => {
                        const t = s2.tasks.find(x => x.id === task.id);
                        if (t === undefined)
                            return;
                        const idx = t.runs.findIndex(r => r.id === run.id);
                        if (idx < 0)
                            return;
                        // Medium-1 覆盖竞态防护：inspect 的异步间隙里 task_report 可能已落终态——
                        // 只覆盖仍为「运行中」的记录，绝不翻转已落定的结果。
                        if (t.runs[idx]?.status !== '运行中')
                            return;
                        t.runs[idx] = finish;
                        t.lastStatus = finish.status;
                        if (finish.finishedAt !== undefined)
                            t.lastRunAt = finish.finishedAt;
                        t.column = finish.status === '成功' ? '已完成' : '已失败';
                    });
                    if (outcome.outcome !== 'cancelled' && run.ledgerRecordId !== undefined) {
                        const summary = outcome.outcome === 'succeeded'
                            ? `任务 ${task.title} 执行成功（会话 ${run.sessionId}）`
                            : `任务 ${task.title} 执行失败：${'error' in outcome ? outcome.error : '未知原因'}`;
                        const filled = fillResult(run.ledgerRecordId, summary);
                        if (filled.ok)
                            this.logger?.info?.(`[dsh-task-board] 结果已回填账本（${run.ledgerRecordId}）`);
                    }
                    // 记忆沉淀（turn/end 兜底路径）：模型未调 task_report 时由宿主结算，
                    // 摘要用宿主模板句（信息量低于分身自报，但保证"经验积累"不缺页）。
                    if (outcome.outcome === 'succeeded' || outcome.outcome === 'failed') {
                        const fallbackSummary = 'error' in outcome && outcome.error !== undefined ? outcome.error : `会话执行${finish.status}`;
                        void recordTaskOutcome({ id: task.id, title: task.title }, finish.status === '成功' ? '成功' : '失败', fallbackSummary);
                    }
                }
            }
            // c) 活动视图刷新（看板 = 唯一活动权威；会话维度失败自行降级）
            await this.refreshActivity();
        }
        catch (e) {
            this.logger?.warn?.(`[dsh-task-board] tick 异常（下一轮自动重试）: ${e instanceof Error ? e.message : String(e)}`);
        }
        finally {
            this.ticking = false;
        }
    }
    taskOf(taskId) {
        return loadBoard().tasks.find(t => t.id === taskId);
    }
    recordRun(taskId, run, opts) {
        transact((store) => {
            const t = store.tasks.find(x => x.id === taskId);
            if (t === undefined)
                return;
            t.runs.push(run);
            if (t.runs.length > MAX_RUNS_PER_TASK)
                t.runs.shift();
            t.lastRunAt = run.startedAt;
            t.lastStatus = run.status;
            if (run.sessionId !== undefined)
                t.lastSessionId = run.sessionId;
            if (run.status === '运行中')
                t.column = '进行中';
            const blocked = run.status === '已阻断' && opts?.keepColumn !== true;
            if (opts?.failColumn === true || run.status === '失败' || blocked)
                t.column = '已失败';
            if (run.status === '成功')
                t.column = '已完成';
            t.updatedAt = new Date().toISOString();
        });
        return run;
    }
    // ── 透传给路由层的 CRUD ──
    async create(input) {
        return this.createWithGovernance(input);
    }
    update(id, patch) {
        return updateTask(id, patch);
    }
    archive(id, archived) {
        return setArchived(id, archived);
    }
    remove(id) {
        return deleteTask(id);
    }
}
/** 供路由层构造（每个宿主进程一个服务实例）。 */
export function createService(gateway, options) {
    return new TaskBoardService(gateway, options);
}
