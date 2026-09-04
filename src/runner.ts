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

export const EXECUTION_PRESET = 'digital-twin'

export type ExecutionOutcome =
  | { outcome: 'pending' }
  | { outcome: 'succeeded' }
  | { outcome: 'failed'; error: string }
  | { outcome: 'cancelled'; error: string }

export class LaunchError extends Error {
  constructor(readonly sessionId: string | undefined, message: string) {
    super(message)
  }
}

export class TaskRunner {
  private readonly gateway: GatewayClient
  private readonly scanMemos = new Map<string, number>()

  constructor(
    gateway: GatewayClient | TypertGateway,
    /** 执行预设 id；缺省 digital-twin（决策五：分身是唯一执行身份） */
    private readonly presetId: string = EXECUTION_PRESET,
  ) {
    this.gateway = gateway instanceof GatewayClient ? gateway : new GatewayClient(gateway)
  }

  /** 投递任务：返回执行会话 id。任何一步失败都抛错（fail-closed，不静默降级）。 */
  async launch(task: TaskRecord): Promise<string> {
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
        content: [{ type: 'text', text: composePrompt({ title: task.title, prompt: task.prompt, taskId: task.id, trigger: '手动' }) }],
      })
    } catch (error) {
      throw new LaunchError(sessionId, `任务投递失败: ${error instanceof Error ? error.message : String(error)}`)
    }
    return sessionId
  }

  /** 定时触发与手动共用同一投递链路，仅来源声明不同。 */
  async launchScheduled(task: TaskRecord): Promise<string> {
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
        content: [{ type: 'text', text: composePrompt({ title: task.title, prompt: task.prompt, taskId: task.id, trigger: '定时' }) }],
      })
    } catch (error) {
      throw new LaunchError(sessionId, `任务投递失败: ${error instanceof Error ? error.message : String(error)}`)
    }
    return sessionId
  }

  /** 完成判定：先 follow 唤醒会话（订阅事件流驱动 agent 循环消费排队消息），再回溯事件找 turn/end。 */
  async inspect(sessionId: string, startedAt: number): Promise<ExecutionOutcome> {
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
      this.scanMemos.delete(sessionId)
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
      .filter(e => e.type === 'turn/end' && e.time >= startedAt)
      .sort((a, b) => a.seq - b.seq)[0]
    if (turnEnd === undefined) return { outcome: 'pending' }

    const data = turnEnd.data as { reason?: { kind?: string } } | null
    if (data !== null && typeof data === 'object' && typeof data.reason === 'object' && data.reason !== null && data.reason.kind === 'error') {
      return { outcome: 'failed', error: '分身执行轮次以错误结束' }
    }
    return { outcome: 'succeeded' }
  }
}
