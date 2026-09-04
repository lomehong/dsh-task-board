import { GatewayClient } from './gateway.js';
import { TaskRunner } from './runner.js';
import { adjudicate, fillResult } from './governance.js';
import { loadBoard, transact, createTask, updateTask, setArchived, deleteTask, genId, MAX_RUNS_PER_TASK } from './ledger.js';
import { collectDueTasks } from './scheduler.js';
export class TaskBoardService {
    runner;
    logger;
    tickTimer;
    tickIntervalMs;
    defaultWorkspaceId;
    ticking = false;
    constructor(gateway, options = {}) {
        this.runner = new TaskRunner(new GatewayClient(gateway));
        this.tickIntervalMs = options.tickIntervalMs ?? 15_000;
        this.defaultWorkspaceId = options.defaultWorkspaceId !== undefined ? options.defaultWorkspaceId : undefined;
    }
    /** 宿主接线后启动 tick 循环；返回停止函数。 */
    start() {
        this.tickTimer = setInterval(() => { void this.tick(); }, this.tickIntervalMs);
        return () => { if (this.tickTimer !== undefined)
            clearInterval(this.tickTimer); };
    }
    /** 状态快照（浏览器异步视图的完整数据面）。 */
    state() {
        const store = loadBoard();
        return { ...store, scheduler: this.lastTickAt !== undefined ? { lastTickAt: this.lastTickAt } : {} };
    }
    lastTickAt;
    /** 创建任务并按声明的动作级别做**预裁决**：L2 及以上立即产生审批令牌（不等首次执行）。 */
    async createWithGovernance(input) {
        const task = createTask(input);
        if (task.actionLevel === 'L2' || task.actionLevel === 'L3') {
            try {
                await adjudicate({ taskId: task.id, actionType: task.actionType, targetScope: task.targetScope, actionLevel: task.actionLevel });
            }
            catch { /* 账本缺席等错误延迟到执行时暴露 */ }
        }
        return task;
    }
    /** 执行任务：账本裁决 → 放行则投递分身会话。返回执行记录（含审批令牌时为待审批）。 */
    async run(taskId, trigger) {
        const startedAtMs = Date.now();
        const startedAtIso = new Date(startedAtMs).toISOString();
        // 1) 账本裁决（fail-closed：账本缺席时 adjudicate 抛错 → 记为已阻断）
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
        // 2) 阻断/拒绝：落审批令牌，不投递
        if (!verdict.allowed) {
            return this.recordRun(taskId, {
                id: genId('RUN'), startedAt: startedAtIso, status: verdict.decision === '阻断' ? '待审批' : '已阻断',
                trigger,
                ledgerRecordId: verdict.recordId,
                ...(verdict.reason !== undefined ? { summary: verdict.reason } : {}),
            });
        }
        // 3) 放行：投递分身会话
        const task = this.taskOf(taskId);
        if (task === undefined)
            throw new Error(`任务不存在: ${taskId}`);
        const run = { id: genId('RUN'), startedAt: startedAtIso, status: '运行中', trigger, ledgerRecordId: verdict.recordId };
        try {
            const sessionId = await this.runner.launch(task);
            run.sessionId = sessionId;
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
    /** tick：调度触发 + 运行中执行的结果判定。 */
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
            // b) 运行中的执行做结果判定
            const store = loadBoard();
            for (const task of store.tasks) {
                const running = task.runs.filter(r => r.status === '运行中' && r.sessionId !== undefined);
                for (const run of running) {
                    const outcome = await this.runner.inspect(run.sessionId, Date.parse(run.startedAt));
                    this.logger?.info?.(`[dsh-task-board] inspect ${run.sessionId} → ${outcome.outcome}${'error' in outcome ? ` (${outcome.error})` : ''}`);
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
                        if (idx >= 0)
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
                }
            }
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
            if (opts?.failColumn === true || run.status === '失败' || run.status === '已阻断')
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
