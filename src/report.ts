/**
 * 执行结果上报（模型侧 → 看板）：task_report 工具的落地实现。
 *
 * 设计（主任拍板的验收语义：**分身自报 ≠ 完成，主人确认才是完成**）：
 * 分身会话在执行看板任务时调用 task_report，把**模型自己声明的**结果状态与摘要
 * 回填到最新的「运行中」执行记录——运行进入「待确认」态（非终态），任务保持
 * 进行中；**主任确认后才落定终态并沉淀记忆**。tick 的 turn/end 推断降级为兜底。
 *
 * 本模块与宿主入口共享同一 ledger.ts 单写者事务（同模块单例）。
 * 并发边界（如实声明，安全审计 M-4）：单宿主进程内由 transact 同步串行保证；
 * **跨进程无锁**——不要以共享 DSH_HOME 的方式并发运行多个会写看板的实例。
 */
import { transact, loadBoard, type TaskRecord, type RunRecord } from './ledger.ts'
import { fillResult } from './governance.ts'
import { recordTaskOutcome } from './memory.ts'

/** 上报状态：分身自报（主任确认前为「待确认」，非终态）。 */
export type ReportStatus = '成功' | '失败'

export interface ReportInput {
  status: ReportStatus
  summary: string
  /** 调用方会话 id（防伪造：必须与任务运行记录的执行会话一致） */
  sessionId: string
}

export interface ReportOutcome {
  ok: boolean
  error?: string
  task?: TaskRecord
  run?: RunRecord
}

/**
 * 上报执行结果：定位该任务最新的「运行中」执行记录，进入「待主任确认」态。
 * 账本记录在位时同步回填模型真实摘要（标注「待主任确认」）。
 * 主任确认（confirmTaskResult）后才落定终态并沉淀记忆。
 *
 * @param taskId - 看板任务 id（投递提示词中携带）。
 * @param input - status + summary + 调用方会话 id。
 * @returns 上报结果；任务不存在、无进行中执行或会话与执行会话不一致时 ok=false。
 */
export function reportTaskResult(taskId: string, input: ReportInput): ReportOutcome {
  if (input.status !== '成功' && input.status !== '失败') {
    return { ok: false, error: `status 必须是 成功 或 失败（收到: ${String(input.status)}）` }
  }
  const trimmed = input.summary.trim()
  if (trimmed === '') return { ok: false, error: 'summary 必填（给主任看的结果摘要）' }
  if (input.sessionId.trim() === '') return { ok: false, error: 'sessionId 必填（防伪造：须与执行会话一致）' }

  const ledgerRecordId: string | undefined = (() => {
    const task = loadBoard().tasks.find(t => t.id === taskId)
    if (task === undefined) return undefined
    const running = [...task.runs].reverse().find(r => r.status === '运行中')
    return running?.ledgerRecordId
  })()

  let mismatch = false
  let settled: RunRecord | undefined
  let updated: TaskRecord | undefined
  transact((store) => {
    const task = store.tasks.find(t => t.id === taskId)
    if (task === undefined || task.archived === true) return
    const running = [...task.runs].reverse().find(r => r.status === '运行中')
    if (running === undefined) return
    // F-03 防伪造：上报会话必须与派发的执行会话一致，否则拒绝进入待确认
    if (running.sessionId === undefined || running.sessionId !== input.sessionId.trim()) {
      mismatch = true
      return
    }
    // 主任拍板的验收语义：自报 ≠ 完成。进入「待确认」态（非终态）——
    // 主任在今日待办/对话里确认后才落定终态并沉淀记忆。
    running.status = '待确认'
    running.reportedStatus = input.status
    running.finishedAt = new Date().toISOString()
    running.summary = trimmed
    task.lastStatus = '待确认'
    task.lastRunAt = running.finishedAt
    task.updatedAt = task.lastRunAt
    settled = running
    updated = task
  })

  if (mismatch) {
    return { ok: false, error: '上报会话与任务执行会话不一致（已拒绝进入待确认，防伪造）' }
  }
  if (settled === undefined || updated === undefined) {
    return { ok: false, error: `任务 ${taskId} 没有进行中的执行可上报（不存在、已归档或已结算）` }
  }

  // 账本留痕：分身自报摘要回填，标注「待主任确认」（本地降级模式无账本记录时跳过）
  if (ledgerRecordId !== undefined) {
    const filled = fillResult(ledgerRecordId, `任务 ${taskId} 执行${input.status}（分身自报，待主任确认）：${trimmed}`)
    if (!filled.ok) {
      // 回填失败不影响看板状态；留痕缺口在下次审计可见
    }
  }

  return { ok: true, task: updated, run: settled }
}

/**
 * 主任确认（今日待办按钮 / 对话内 task_approve 的落地点）：把「待确认」的自报
 * 结果落定终态——确认 → 按自报状态记成功并沉淀记忆（已验证结果，主任背书）；
 * 驳回 → 记失败（主任判定未通过）。仅对「待确认」运行生效，重复调用幂等安全。
 *
 * @param taskId - 看板任务 id。
 * @param approved - true=主任确认自报结果；false=主任判定未通过。
 * @param by - 确认来源标注。
 * @returns 确认结果；无待确认运行时 ok=false。
 */
export function confirmTaskResult(
  taskId: string,
  approved: boolean,
  by = '主任确认',
): { ok: boolean; error?: string; task?: TaskRecord; run?: RunRecord } {
  let settledRun: RunRecord | undefined
  let taskRec: TaskRecord | undefined
  transact((store) => {
    const task = store.tasks.find(t => t.id === taskId)
    if (task === undefined || task.archived === true) return
    const pending = [...task.runs].reverse().find(r => r.status === '待确认')
    if (pending === undefined) return
    pending.status = approved ? '成功' : '失败'
    pending.finishedAt = new Date().toISOString()
    pending.summary = `${pending.summary}（${by}）`
    task.lastStatus = pending.status
    task.lastRunAt = pending.finishedAt ?? new Date().toISOString()
    task.column = approved ? '已完成' : '已失败'
    task.updatedAt = task.lastRunAt
    settledRun = pending
    taskRec = task
  })
  if (settledRun === undefined || taskRec === undefined) {
    return { ok: false, error: `任务 ${taskId} 没有待确认的自报结果可确认` }
  }
  // 记忆沉淀（主任背书的已验证结果——「分身自报 ≠ 完成，主人确认才是」的终点）
  void recordTaskOutcome({ id: taskId, title: taskRec.title }, approved ? '成功' : '失败', settledRun.summary ?? '')
  return { ok: true, task: taskRec, run: settledRun }
}
