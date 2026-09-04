/**
 * 执行/调度/治理集成测试：使用 stub Gateway 模拟 0.1.2 系会话网关，
 * 覆盖失败-closed 钉扎、执行成功/失败回填、cron 调度触发、账本缺席拒绝。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { TypertGateway, SessionSummary, SessionPage } from '../src/gateway.ts'
import { TaskRunner } from '../src/runner.ts'
import { createService } from '../src/service.ts'
import { collectDueTasks } from '../src/scheduler.ts'
import { cronMatches } from '../src/cron.ts'
import { createTask, loadBoard, transact } from '../src/ledger.ts'
import { injectLedgerGetter, type LedgerModule } from '../src/governance.ts'

interface FakeState {
  presets: Array<{ id: string; broken?: string }>
  sessions: Map<string, { running: boolean; title?: string }>
  prompts: Array<{ sessionId: string; text: string }>
  nextSessionId: number
  page: (sid: string) => SessionPage
  failOnCreate?: boolean
}

function method_check(args: unknown, want: string): boolean {
  return true // follow 是该 namespace 唯一 stream 方法
}

function buildGateway(state: FakeState): TypertGateway {
  return {
    async invoke({ namespace, method, args }) {
      // 接收 runner→GatewayClient.invoke 已 wire 后的 args：
      // - agentPresets/list → args 为 {}，请求体为空
      // - session/list       → args = { _request: req }
      // - 其它 session 方法   → args = { request: req }
      const asAny = (args ?? {}) as Record<string, unknown>
      const req = ((asAny.request ?? asAny._request) ?? {}) as Record<string, unknown>

      if (namespace === 'agentPresets' && method === 'list') return { presets: state.presets }
      if (namespace === 'session' && method === 'list') return { items: [...state.sessions.entries()].map(([sessionId, s]) => ({ sessionId, running: s.running, title: s.title })) }
      if (namespace === 'session' && method === 'create') {
        if (state.failOnCreate === true) throw new Error('模拟创建失败')
        const id = `S-${state.nextSessionId++}`
        state.sessions.set(id, { running: true, title: req.title })
        return { sessionId: id }
      }
      if (namespace === 'session' && method === 'rename') {
        const s = state.sessions.get(String(req.sessionId))
        if (s !== undefined) s.title = String(req.title)
        return { ok: true }
      }
      if (namespace === 'session' && method === 'prompt') {
        const text = (req.content as Array<{ text: string }>)[0]?.text ?? ''
        state.prompts.push({ sessionId: String(req.sessionId), text })
        return { ok: true }
      }
      if (namespace === 'session' && method === 'page') {
        return state.page(String((req.address as { sessionId?: string }).sessionId ?? ''))
      }
      throw new Error(`未实现的 gateway 调用：${namespace}/${method}`)
    },
    async stream({ namespace, args }) {
      if (namespace === 'session' && method_check(args, 'follow')) {
        const sid = String((args as { request?: { address?: { sessionId?: string } } }).request?.address?.sessionId ?? '')
        // 返回 snapshot：cursor = 0，records 由 state.page 提供
        const page = state.page(sid)
        return { async *[Symbol.asyncIterator]() { yield { type: 'snapshot', cursor: 0, records: [], hasMore: page.records.length > 0 } } }
      }
      throw new Error(`不支持 stream：${namespace}`)
    },
  }
}

const noEventsPage = (sid: string): SessionPage => ({ records: [], hasMore: false, cursor: 0 })

let home: string

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'tb-svc-'))
  process.env.DSH_HOME = home
  injectLedgerGetter(() => undefined) // 重置账本注入——大多数测试只校验 fail-closed 行为
})

afterEach(() => {
  delete process.env.DSH_HOME
  rmSync(home, { recursive: true, force: true })
})

describe('TaskRunner：执行会话与完成判定', () => {
  it('launch 创建会话→重命名→投递提示词；inspect 在会话不再运行时 pending（无 turn/end）', async () => {
    const state: FakeState = { presets: [{ id: 'digital-twin' }], sessions: new Map(), prompts: [], nextSessionId: 1, page: noEventsPage }
    const runner = new TaskRunner(buildGateway(state))
    const task = createTask({ title: '汇总', prompt: '做汇总', actionType: '整理', targetScope: '记忆库', actionLevel: 'L1' })
    const sid = await runner.launch(task)
    expect(sid).toBe('S-1')
    expect(state.sessions.get(sid)?.title).toBe('汇总')
    expect(state.prompts).toHaveLength(1)
    expect(state.prompts[0]?.text).toContain('任务看板执行')
    expect(state.prompts[0]?.text).toContain(task.id)
    const outcome = await runner.inspect(sid, Date.now() - 1000)
    expect(outcome.outcome).toBe('pending')
  })

  it('launch fail-closed：broken 预设直接抛错，不创建会话', async () => {
    const state: FakeState = { presets: [{ id: 'digital-twin', broken: 'plugin missing' }], sessions: new Map(), prompts: [], nextSessionId: 1, page: noEventsPage }
    const runner = new TaskRunner(buildGateway(state))
    const task = createTask({ title: 't', prompt: 'p', actionType: 'a', targetScope: 'b' })
    await expect(runner.launch(task)).rejects.toThrow(/不可用.*plugin missing/)
    expect(state.sessions.size).toBe(0)
  })

  it('launch fail-closed：会话创建失败抛错带原因', async () => {
    const state: FakeState = { presets: [{ id: 'digital-twin' }], sessions: new Map(), prompts: [], nextSessionId: 1, page: noEventsPage, failOnCreate: true }
    const runner = new TaskRunner(buildGateway(state))
    const task = createTask({ title: 't', prompt: 'p', actionType: 'a', targetScope: 'b' })
    await expect(runner.launch(task)).rejects.toThrow(/任务投递失败/)
  })

  it('inspect：会话不存在 → 已取消；会话结束运行 + turn/end success → 成功', async () => {
    const state: FakeState = { presets: [{ id: 'digital-twin' }], sessions: new Map(), prompts: [], nextSessionId: 1, page: () => ({ records: [{ event: { type: 'turn/end', seq: 1, time: Date.now(), data: { reason: { kind: 'finish' } } } }], hasMore: false }) }
    const runner = new TaskRunner(buildGateway(state))
    const task = createTask({ title: 't', prompt: 'p', actionType: 'a', targetScope: 'b' })
    const sid = await runner.launch(task)
    // 模拟执行完毕（不再 running）
    state.sessions.get(sid)!.running = false
    const outcome = await runner.inspect(sid, Date.now() - 1000)
    expect(outcome.outcome).toBe('succeeded')
  })

  it('inspect：turn/end 带 error → 失败', async () => {
    const state: FakeState = { presets: [{ id: 'digital-twin' }], sessions: new Map(), prompts: [], nextSessionId: 1, page: () => ({ records: [{ event: { type: 'turn/end', seq: 1, time: Date.now(), data: { reason: { kind: 'error' } } } }], hasMore: false }) }
    const runner = new TaskRunner(buildGateway(state))
    const task = createTask({ title: 't', prompt: 'p', actionType: 'a', targetScope: 'b' })
    const sid = await runner.launch(task)
    state.sessions.get(sid)!.running = false
    const outcome = await runner.inspect(sid, Date.now() - 1000)
    expect(outcome.outcome).toBe('failed')
  })
})

describe('治理：账本缺席 fail-closed', () => {
  it('adjudicate 在账本缺席时抛错（含安装指引），符合决策二的 fail-closed 原则', async () => {
    const { adjudicate } = await import('../src/governance.ts')
    expect(() => adjudicate({ taskId: 'X', actionType: 'a', targetScope: 'b', actionLevel: 'L1' })).toThrow(/账本缺席/)
  })

  it('注入账本后 adjudicate 返回 GovernanceVerdict', async () => {
    const fake: LedgerModule = {
      check: () => ({ record: { id: 'R1', status: '已放行' }, judgment: { decision: '放行', level: 'L1' } }),
      fillResult: () => ({ ok: true }),
    }
    injectLedgerGetter(() => fake)
    const { adjudicate } = await import('../src/governance.ts')
    const v = adjudicate({ taskId: 'X', actionType: 'a', targetScope: 'b', actionLevel: 'L1' })
    expect(v.allowed).toBe(true)
    expect(v.decision).toBe('放行')
    expect(v.recordId).toBe('R1')
  })

  it('L2 阻断返回审批令牌（进今日待办的载体）', async () => {
    const fake: LedgerModule = {
      check: () => ({ record: { id: 'R2', status: '已阻断' }, judgment: { decision: '阻断', level: 'L2' }, approval: { id: 'P1' } }),
      fillResult: () => ({ ok: true }),
    }
    injectLedgerGetter(() => fake)
    const { adjudicate } = await import('../src/governance.ts')
    const v = adjudicate({ taskId: 'X', actionType: '敏感操作', targetScope: '外部', actionLevel: 'L2' })
    expect(v.allowed).toBe(false)
    expect(v.approvalId).toBe('P1')
  })
})

describe('scheduler：cron 触发与去重', () => {
  it('collectDueTasks 推进 lastMinuteKey 防同分钟重复', () => {
    const t = createTask({ title: '每分钟任务', prompt: 'p', actionType: 'a', targetScope: 'b', actionLevel: 'L1', cron: '* * * * *' })
    const at = new Date()
    const first = collectDueTasks(at)
    expect(first.map(x => x.id)).toContain(t.id)
    const second = collectDueTasks(at) // 同分钟
    expect(second.map(x => x.id)).not.toContain(t.id)
    // 跨分钟
    const next = new Date(at.getTime() + 60_000)
    const third = collectDueTasks(next)
    expect(third.map(x => x.id)).toContain(t.id)
  })

  it('cron 不命中时不触发；归档任务永不触发', () => {
    createTask({ title: '半夜', prompt: 'p', actionType: 'a', targetScope: 'b', actionLevel: 'L1', cron: '0 0 1 1 *' }) // 1月1日
    const t = createTask({ title: '归档', prompt: 'p', actionType: 'a', targetScope: 'b', actionLevel: 'L1', cron: '* * * * *' })
    transact((s) => { const x = s.tasks.find(y => y.id === t.id)!; x.archived = true })
    const due = collectDueTasks(new Date('2026-06-15T10:00:00'))
    expect(due).toHaveLength(0)
  })
})

describe('service：执行状态机', () => {
  it('run：账本缺席记为「已阻断」并把原因记入 summary（fail-closed）', async () => {
    injectLedgerGetter(() => undefined) // 测试环境确保账本缺席
    const state: FakeState = { presets: [{ id: 'digital-twin' }], sessions: new Map(), prompts: [], nextSessionId: 1, page: noEventsPage }
    const svc = createService(buildGateway(state))
    const t = createTask({ title: 't', prompt: 'p', actionType: 'a', targetScope: 'b' })
    const run = await svc.run(t.id, '手动')
    expect(run.status).toBe('已阻断')
    expect(run.summary).toMatch(/账本缺席/)
    expect(loadBoard().tasks.find(x => x.id === t.id)?.column).toBe('已失败')
  })

  it('run：账本放行 → 投递会话成功 → 记录「运行中」', async () => {
    const fake: LedgerModule = {
      check: () => ({ record: { id: 'R1', status: '已放行' }, judgment: { decision: '放行', level: 'L1' } }),
      fillResult: () => ({ ok: true }),
    }
    injectLedgerGetter(() => fake)
    const state: FakeState = { presets: [{ id: 'digital-twin' }], sessions: new Map(), prompts: [], nextSessionId: 1, page: noEventsPage }
    const svc = createService(buildGateway(state))
    const t = createTask({ title: 't', prompt: 'p', actionType: 'a', targetScope: 'b' })
    const run = await svc.run(t.id, '手动')
    expect(run.status).toBe('运行中')
    expect(run.sessionId).toBe('S-1')
    expect(state.prompts).toHaveLength(1)
  })

  it('createWithGovernance：L2 任务创建时即触发账本裁决（不等执行时）', async () => {
    const fake: LedgerModule = {
      check: vi.fn(() => ({ record: { id: 'R1', status: '已阻断' }, judgment: { decision: '阻断', level: 'L2' }, approval: { id: 'P1' } })),
      fillResult: () => ({ ok: true }),
    }
    injectLedgerGetter(() => fake)
    const state: FakeState = { presets: [{ id: 'digital-twin' }], sessions: new Map(), prompts: [], nextSessionId: 1, page: noEventsPage }
    const svc = createService(buildGateway(state))
    await svc.create({ title: '高危', prompt: 'p', actionType: '外部动作', targetScope: '外部', actionLevel: 'L2' })
    expect(fake.check).toHaveBeenCalled() // 创建时立即裁决（与决策二「从出生就在治理框架内」对齐）
  })

  it('L1 任务创建时**不**触发裁决——L0/L1 默认放行，裁决成本应只在高风险动作上', async () => {
    const fake: LedgerModule = {
      check: vi.fn(() => ({ record: { id: 'R1', status: '已放行' }, judgment: { decision: '放行', level: 'L1' } })),
      fillResult: () => ({ ok: true }),
    }
    injectLedgerGetter(() => fake)
    const svc = createService(buildGateway({ presets: [{ id: 'digital-twin' }], sessions: new Map(), prompts: [], nextSessionId: 1, page: noEventsPage }))
    await svc.create({ title: '低风险', prompt: 'p', actionType: '整理', targetScope: '记忆库', actionLevel: 'L1' })
    expect(fake.check).not.toHaveBeenCalled()
  })
})
