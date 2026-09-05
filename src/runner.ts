/**
 * 执行器：把任务投递给真实的分身会话。
 *
 * 执行链（fail-closed，借鉴外部实现的钉扎纪律）：
 * 1. 校验执行预设存在且未 broken（agentPresets/list）——固定 digital-twin，
 *    分身是唯一的任务执行身份（决策五：预设统一，全工具分身）
 * 2. session/create（钉 workspace + 预设）
 * 3. session/rename（会话名 = 任务标题，便于回溯）
 * 4. session/prompt（mode=queue 投递任务提示词）
 *
 * 完成判定（inspect）：session/list 看会话不在运行 → session/page 回溯找
 * turn/end（时间不早于启动时刻）→ turn/end 带 error 即失败，否则成功；
 * 会话消失 = 已取消；找不到边界 = 仍在进行。
 */
import { GatewayClient, sessionAddress, type SessionPage, type SessionSummary, type TypertGateway } from './gateway.ts'
import { composePrompt } from './prompt.ts'
import type { TaskRecord } from './ledger.ts'
import { foldGoalFromRecords, goalCreateSpec, GOAL_ROUNDS_BY_LEVEL } from './goals.ts'

export const EXECUTION_PRESET = 'digital-twin'

export type ExecutionOutcome =
  | { outcome: 'pending' }
  | { outcome: 'succeeded'; goalPhase?: 'complete' }
  | { outcome: 'failed'; error: string; goalPhase?: 'blocked' }
  | { outcome: 'cancelled'; error: string }

export interface LaunchResult {
  sessionId: string
  /** 已为执行会话播种原生 goal（播种失败/不适用级别为 false） */
  goalSeeded: boolean
}

export class LaunchError extends Error {
  constructor(readonly sessionId: string | undefined, message: string) {
    super(message)
  }
}

export class TaskRunner {
  private readonly gateway: GatewayClient

  constructor(
    gateway: GatewayClient | TypertGateway,
    /** 执行预设 id；缺省 digital-twin（决策五：分身是唯一执行身份） */
    private readonly presetId: string = EXECUTION_PRESET,
  ) {
    this.gateway = gateway instanceof GatewayClient ? gateway : new GatewayClient(gateway)
  }

  /** 投递任务：返回执行会话与 goal 播种状态。投递失败抛错（fail-closed）；
   *  goal 播种失败降级（goalSeeded=false，结算退回 turn/end 语义）。
   *  @param trigger 来源声明（手动/定时）——写入投递提示词，让分身知道任务由谁触发。 */
  async launch(task: TaskRecord, trigger: '手动' | '定时' = '手动'): Promise<LaunchResult> {
    // 预设校验（fail-closed 钉扎）：broken 预设的会话挂不出来
    const presets = (await this.gateway.invoke('agentPresets', 'list')) as {
      presets?: ReadonlyArray<{ id: string; broken?: string }>
    }
    const preset = presets.presets?.find(item => item.id === this.presetId)
    if (preset === undefined) throw new LaunchError(undefined, `执行预设不存在: ${this.presetId}`)
    if (preset.broken !== undefined) throw new LaunchError(undefined, `执行预设不可用: ${preset.broken}`)

    let sessionId: string | undefined
    try {
      const created = (await this.gateway.invoke('session', 'create', {
        ...(task.workspaceId !== undefined ? { workspaceId: task.workspaceId } : {}),
        agentPreset: this.presetId,
      })) as { sessionId: string }
      sessionId = created.sessionId
      await this.gateway.invoke('session', 'rename', { sessionId, title: task.title })
      await this.gateway.invoke('session', 'prompt', {
        sessionId,
        requestId: 'task-board-' + crypto.randomUUID(),
        mode: 'queue',
        content: [{ type: 'text', text: composePrompt({ title: task.title, prompt: task.prompt, taskId: task.id, trigger }) }],
      })
    } catch (error) {
      throw new LaunchError(sessionId, `任务投递失败: ${error instanceof Error ? error.message : String(error)}`)
    }
    // L2 goal 播种（审计路线第二批）：执行会话获得自主推进预算——一轮没做完
    // goal-round 驱动继续，直到 complete/blocked 才结算（结算感知 goal 相位）。
    // 播种失败降级为 turn/end 结算（goalSeeded=false），绝不影响投递。
    let goalSeeded = false
    const goalRounds = GOAL_ROUNDS_BY_LEVEL[task.actionLevel]
    if (sessionId !== undefined && goalRounds !== undefined) {
      try {
        const objective = `${task.title}：${task.prompt.slice(0, 80)}`
        await this.gateway.invokeSpec(goalCreateSpec(sessionId, objective, goalRounds))
        goalSeeded = true
      } catch { /* 播种失败：降级为 turn/end 结算，不影响任务投递 */ }
    }
    return { sessionId: sessionId, goalSeeded }
  }

  /** 完成判定：先 follow 唤醒会话（订阅事件流驱动 agent 循环消费排队消息），再回溯事件找 turn/end。
   *  @param opts.goalSeeded 执行会话已播种原生 goal 时，turn/end 只代表一轮结束——
   *   以 goal 相位结算：active → 继续等（下一轮）、complete → 成功、blocked → 失败（含受阻原因）。 */
  async inspect(sessionId: string, startedAt: number, opts: { goalSeeded?: boolean } = {}): Promise<ExecutionOutcome> {
    // follow 激活：dsh 的会话 agent 循环由事件订阅驱动——排队消息（session/prompt
    // mode:queue）在无人订阅的新会话里不会自动执行。短促订阅一次即触发唤醒。
    try {
      const stream = await this.gateway.stream('session', 'follow', { address: sessionAddress(sessionId), maxMessages: 50 })
      const iterator = (stream as AsyncIterable<unknown>)[Symbol.asyncIterator]()
      const next = await iterator.next()
      if (typeof iterator.return === 'function') await iterator.return()
    } catch { /* follow 失败不阻断结算判定 */ }
    let items: ReadonlyArray<SessionSummary>
    try {
      const response = (await this.gateway.invoke('session', 'list')) as { items?: ReadonlyArray<SessionSummary> }
      items = response.items ?? []
    } catch (e) {
      console.error('[dsh-task-board][inspect] session/list failed:', e instanceof Error ? e.message : String(e))
      return { outcome: 'pending' }
    }
    const summary = items.find(item => item.sessionId === sessionId)
    if (summary === undefined) {
      console.error(`[dsh-task-board][inspect] session ${sessionId} not in list (${items.length} sessions) → cancelled`)
      return { outcome: 'cancelled', error: '执行会话已不存在' }
    }
    if (summary.running === true) return { outcome: 'pending' }

    // 会话已结束运行：follow 拿最新 cursor → page(throughSeq=cursor) 回溯找 turn/end
    // （session/page 的 throughSeq 是 descriptor 必填字段，缺省会被 boundary validation 拒绝）
    let cursor: number | undefined
    try {
      const stream = await this.gateway.stream('session', 'follow', { address: sessionAddress(sessionId), maxMessages: 1 })
      const iterator = (stream as AsyncIterable<unknown>)[Symbol.asyncIterator]()
      const next = await iterator.next()
      if (typeof iterator.return === 'function') await iterator.return()
      const follow = next.done === true ? undefined : next.value as { type?: string; cursor?: number }
      if (follow === undefined || follow.type !== 'snapshot' || typeof follow.cursor !== 'number') {
        return { outcome: 'pending' }
      }
      cursor = follow.cursor
    } catch (e) {
      console.error('[dsh-task-board][inspect] session/follow failed:', e instanceof Error ? e.message : String(e))
      return { outcome: 'pending' }
    }

    let page: SessionPage
    try {
      page = (await this.gateway.invoke('session', 'page', {
        address: sessionAddress(sessionId),
        throughSeq: cursor,
        maxMessages: 200,
      })) as SessionPage
    } catch (e) {
      console.error('[dsh-task-board][inspect] session/page failed:', e instanceof Error ? e.message : String(e))
      return { outcome: 'pending' }
    }

    const turnEnd = page.records
      .map(r => r.event)
      .filter(e => e.type === 'turn/end' && typeof e.time === 'number' && e.time >= startedAt)
      .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))[0]
    if (turnEnd === undefined) return { outcome: 'pending' }

    // goal 相位结算梯子（L2 播种后启用）：turn/end ≠ 完成判断，goal 终相才是。
    if (opts.goalSeeded === true) {
      const goal = foldGoalFromRecords(page.records)
      if (goal !== undefined && goal.status === 'current') {
        if (goal.phase === 'active') return { outcome: 'pending' }
        if (goal.phase === 'complete') return { outcome: 'succeeded', goalPhase: 'complete' }
        if (goal.phase === 'blocked') {
          return { outcome: 'failed', error: goal.blockedMessage ?? '自主目标受阻', goalPhase: 'blocked' }
        }
        // paused：人为暂停不再续跑 → 按 turn/end 结果结算（legacy 语义）
      } else if (goal === undefined) {
        // High-3：goal/change 滚出消息窗（fold 缺席 ≠ 无 goal）——拒绝 legacy 提前
        // 结算，返回 pending 等下一轮窗口；长期滞留由 tick 的 stuck 兜底强制取消。
        return { outcome: 'pending' }
      }
      // cleared：goal 脚手架已被移除 → 按 turn/end 结果结算（legacy 语义）
    }

    const data = turnEnd.data as { reason?: { kind?: string } } | null
    const reasonKind = data !== null && typeof data === 'object' && typeof data.reason === 'object' && data.reason !== null ? String(data.reason.kind ?? '') : ''
    // Medium-2 reason 白名单：宿主 turn/end 的 reason.kind 远不止 error/completed
    // （aborted/interrupted/max-tokens/blocked…）——一律记"成功"会把主人中止、
    // 截断都洗成"已验证结果：成功"。
    if (reasonKind === 'aborted' || reasonKind === 'interrupted') {
      return { outcome: 'cancelled', error: `执行被中止/打断（${reasonKind}）` }
    }
    if (reasonKind === 'error' || reasonKind === 'blocked' || reasonKind === 'max-tokens') {
      return { outcome: 'failed', error: `分身执行轮次异常结束（${reasonKind}）` }
    }
    return { outcome: 'succeeded' }
  }
}
