/**
 * 执行结果上报（模型侧 → 看板）：task_report 工具的落地实现。
 *
 * 设计：分身会话在执行看板任务时调用 task_report，把**模型自己声明的**
 * 结果状态与摘要回填到最新的「运行中」执行记录，并联动任务列与账本留痕。
 * 上报即终态——运行记录立即落定，tick 的 turn/end 推断降级为
 * 「模型未上报时」的兜底（消除自由文本没人消费、宿主模板句回填的断点）。
 *
 * 本模块与宿主入口共享同一 ledger.ts 单写者事务（同模块单例），
 * 多进程并发由文件锁 + 原子重命名兜底（同 memory-store 约定）。
 */
import { transact, loadBoard } from './ledger.js';
import { fillResult } from './governance.js';
import { recordTaskOutcome } from './memory.js';
/**
 * 上报执行结果：定位该任务最新的「运行中」执行记录并落定终态。
 * 账本记录在位时同步回填模型真实摘要（替代宿主模板句）。
 *
 * @param taskId - 看板任务 id（投递提示词中携带）。
 * @param input - status + summary + 调用方会话 id。
 * @returns 上报结果；任务不存在、无进行中执行或会话与执行会话不一致时 ok=false。
 */
export function reportTaskResult(taskId, input) {
    if (input.status !== '成功' && input.status !== '失败') {
        return { ok: false, error: `status 必须是 成功 或 失败（收到: ${String(input.status)}）` };
    }
    const trimmed = input.summary.trim();
    if (trimmed === '')
        return { ok: false, error: 'summary 必填（给主任看的结果摘要）' };
    if (input.sessionId.trim() === '')
        return { ok: false, error: 'sessionId 必填（防伪造：须与执行会话一致）' };
    const ledgerRecordId = (() => {
        const task = loadBoard().tasks.find(t => t.id === taskId);
        if (task === undefined)
            return undefined;
        const running = [...task.runs].reverse().find(r => r.status === '运行中');
        return running?.ledgerRecordId;
    })();
    let mismatch = false;
    let settled;
    let updated;
    transact((store) => {
        const task = store.tasks.find(t => t.id === taskId);
        if (task === undefined || task.archived === true)
            return;
        const running = [...task.runs].reverse().find(r => r.status === '运行中');
        if (running === undefined)
            return;
        // F-03 防伪造：上报会话必须与派发的执行会话一致，否则拒绝落终态
        if (running.sessionId === undefined || running.sessionId !== input.sessionId.trim()) {
            mismatch = true;
            return;
        }
        running.status = input.status;
        running.finishedAt = new Date().toISOString();
        running.summary = trimmed;
        task.lastStatus = input.status;
        task.lastRunAt = running.finishedAt;
        task.column = input.status === '成功' ? '已完成' : '已失败';
        task.updatedAt = task.lastRunAt;
        settled = running;
        updated = task;
    });
    if (mismatch) {
        return { ok: false, error: '上报会话与任务执行会话不一致（已拒绝落终态，防伪造）' };
    }
    if (settled === undefined || updated === undefined) {
        return { ok: false, error: `任务 ${taskId} 没有进行中的执行可上报（不存在、已归档或已结算）` };
    }
    // 账本留痕：用模型真实摘要回填（无账本记录时静默跳过——本地降级模式）
    if (ledgerRecordId !== undefined) {
        const filled = fillResult(ledgerRecordId, `任务 ${taskId} 执行${input.status}（分身自报）：${trimmed}`);
        if (!filled.ok) {
            // 回填失败不影响看板终态；留痕缺口在下次审计可见
        }
    }
    // 记忆沉淀（决策五「记忆是经验积累」）：分身亲报的结果写入共享记忆，
    // 主任以后问「最近完成了哪些工作」即可被 tool-memory / 按回合装配检索到。
    // fire-and-forget：写入失败不影响看板终态（memory.ts 内部已兜底）。
    void recordTaskOutcome({ id: taskId, title: updated.title }, input.status, trimmed);
    return { ok: true, task: updated, run: settled };
}
