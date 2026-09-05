/**
 * DSH 原生 goal 机制接入（@deepseek-ai/dsh-goal，经 typertGateway 远程面）。
 *
 * 主任拍板（L1-L4 一批）：看板执行会话播种 goal（自主推进预算）、结算感知 goal
 * 相位、活动视图汇聚自由会话的自主目标。治理不动：goal 的权威模型归宿主，
 * 本模块只经远程面 create 与从会话事件折叠读取。
 *
 * 远程面（typert.remote-client 生成物）：namespace 'goals'，agentId = SessionId：
 * - goals/create (agentId, request:{objective, maxGoalRounds?}) → {ref}
 * 读面：会话事件流里的 `goal/change`（GoalSnapshotChangeMeta）携带每次变更后的
 * 完整 goal 状态——取最后一条即当前态（纯折叠，无需依赖宿主包）。
 *
 * @module dsh-task-board/goals
 */

export interface GoalEventRecord {
  event?: { type?: string; seq?: number; time?: number; data?: unknown }
}

/** 执行会话的 goal 轮次预算（按动作级别；L0 单轮即可，L3 走不到这里）。 */
export const GOAL_ROUNDS_BY_LEVEL: Record<'L0' | 'L1' | 'L2' | 'L3', number | undefined> = {
  L0: undefined,
  L1: 2,
  L2: 3,
  L3: undefined,
}

/** goals/create 的远程调用规格（agentId = 执行会话 id）。 */
export function goalCreateSpec(sessionId: string, objective: string, maxGoalRounds: number): {
  namespace: 'goals'
  method: 'create'
  args: { agentId: string; request: { objective: string; maxGoalRounds: number } }
} {
  return { namespace: 'goals', method: 'create', args: { agentId: sessionId, request: { objective, maxGoalRounds } } }
}

/** 折叠结果：current=存在当前 goal；cleared=goal 已被显式清除（墓碑）。undefined=窗口内无任何 goal 事件。 */
export type GoalFoldResult =
  | {
      status: 'current'
      phase: 'active' | 'paused' | 'blocked' | 'complete'
      objective: string
      roundsStarted: number
      maxGoalRounds: number
      blockedMessage?: string
    }
  | { status: 'cleared' }

/**
 * 从会话事件页折叠当前 goal 状态（数组序 last-wins，宿主单页按 seq 升序返回）。
 *
 * 关键语义（并发审查 High-2）：`operation === 'clear'` 的事件是**无 goal 字段的
 * 墓碑**——显式折叠为 cleared，绝不残留上一条快照的旧相位（否则主人清除 goal 后
 * 看板仍按 active 判"继续等"，任务永久进行中）。
 */
export function foldGoalFromRecords(
  records: ReadonlyArray<GoalEventRecord>,
): GoalFoldResult | undefined {
  let folded: GoalFoldResult | undefined = undefined
  for (const r of records) {
    const ev = r?.event
    if (ev === undefined || ev.type !== 'goal/change') continue
    const data = ev.data as {
      operation?: string
      goal?: { phase?: string; objective?: string; maxGoalRounds?: number; blockedReason?: { message?: string } }
      roundsStarted?: number
    } | undefined
    // clear 墓碑（High-2）：无 goal 字段——显式折叠为「已清除」
    if (data === undefined || data.operation === 'clear' || data.goal === undefined) {
      folded = { status: 'cleared' }
      continue
    }
    const phase = data.goal.phase
    if (phase !== 'active' && phase !== 'paused' && phase !== 'blocked' && phase !== 'complete') continue
    if (typeof data.goal.objective !== 'string' || data.goal.objective === '') continue
    folded = {
      status: 'current',
      phase,
      objective: data.goal.objective,
      roundsStarted: typeof data.roundsStarted === 'number' ? data.roundsStarted : 0,
      maxGoalRounds: typeof data.goal.maxGoalRounds === 'number' ? data.goal.maxGoalRounds : 0,
      ...(data.goal.blockedReason?.message !== undefined ? { blockedMessage: data.goal.blockedReason.message } : {}),
    }
  }
  return folded
}
