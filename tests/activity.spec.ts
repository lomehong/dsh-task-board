/**
 * 活动视图 + 对话内下单测试（主任拍板：看板 = 唯一活动权威；一批完成）：
 * - activityView 聚合四个维度（任务执行现场 / 待审批 / 自由会话 / 最近完成）；
 * - task_delegate 立项即预裁决（createWithGovernance），run_now 控制立即执行；
 * - 看板服务缺席 → fail-closed 抛错，不静默假装立项。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTask, transact } from '../src/ledger.ts'
import { TaskBoardService } from '../src/service.ts'
import { injectLedgerGetter } from '../src/governance.ts'
import { injectServiceGetter } from '../src/tools.ts'
import { injectServiceGetter } from '../src/tools.ts'

let home: string

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'task-board-activity-'))
  process.env.DSH_HOME = home
})

afterEach(() => {
  injectServiceGetter(undefined)
  delete process.env.DSH_HOME
  rmSync(home, { recursive: true, force: true })
})

describe('activityView（看板 = 唯一活动权威）', () => {
  it('聚合四维度：任务执行现场 / 自由会话 / 待审批 / 最近完成', async () => {
    const a = createTask({ title: '任务A 执行中', prompt: 'p', actionType: '答疑', targetScope: '本机', actionLevel: 'L0' })
    const b = createTask({ title: '任务B 待审批', prompt: 'p', actionType: '发布内容', targetScope: '外部', actionLevel: 'L2' })
    const c = createTask({ title: '任务C 已完成', prompt: 'p', actionType: '整理汇报', targetScope: '本机', actionLevel: 'L1' })
    transact(store => {
      const ta = store.tasks.find(x => x.id === a.id)!
      ta.runs.push({ id: 'r1', status: '运行中', startedAt: new Date().toISOString(), sessionId: 'sess-task', trigger: '手动' } as never)
      const tb = store.tasks.find(x => x.id === b.id)!
      tb.runs.push({ id: 'r2', status: '待审批', startedAt: new Date().toISOString(), trigger: '手动' } as never)
      const tc = store.tasks.find(x => x.id === c.id)!
      tc.lastStatus = '成功'
      tc.lastRunAt = new Date().toISOString()
      tc.runs.push({ id: 'r3', status: '成功', startedAt: tc.lastRunAt, finishedAt: tc.lastRunAt, summary: '整理完毕', trigger: '手动' } as never)
    })
    const gateway = {
      invoke: async (spec: { namespace: string; method: string }) => {
        if (spec.namespace === 'session' && spec.method === 'list') {
          return { items: [
            { sessionId: 'sess-task', running: true, title: '任务会话' },
            { sessionId: 'sess-free', running: true, title: '自由现场' },
            { sessionId: 'sess-idle', running: false, title: '闲置' },
          ] }
        }
        if (spec.namespace === 'session' && spec.method === 'page') {
          // 自由会话的 goal/change 事件（objective > 40 字 → 验证看板侧截断）
          return { records: [
            { event: { type: 'goal/change', seq: 9, time: 1, data: {
              kind: 'goal/change', goal: {
                id: 'g1', revision: 3, phase: 'active',
                objective: '这是一个超过四十字的很长的自主目标描述需要在活动视图里被截断以保证提示词紧凑与可读性不失控',
                maxGoalRounds: 5,
              },
              roundsStarted: 2,
            } } },
          ] }
        }
        return { records: [] }
      },
      // 宿主 follow 契约：首条消息为 snapshot（携带最新 cursor）——refreshActivity
      // 据此做反向翻页（High-1 修复后语义）。
      stream: async () => {
        const snapshot = { type: 'snapshot', cursor: 999 }
        return (async function* () { yield snapshot })()
      },
    }
    const service = new TaskBoardService(gateway)
    await service.refreshActivity()
    const act = service.activityView()
    expect(act.runningTasks).toEqual([{ taskId: a.id, title: '任务A 执行中', sessionId: 'sess-task' }])
    expect(act.pendingApprovals).toEqual([{ taskId: b.id, title: '任务B 待审批' }])
    expect(act.freeSessions).toEqual([{ sessionId: 'sess-free', title: '自由现场' }])
    expect(act.recentCompleted.map(x => x.title)).toContain('任务C 已完成')
    expect(act.recentCompleted[0]?.summary).toBe('整理完毕')
    expect(act.goals).toHaveLength(1)
    expect(act.goals[0].sessionId).toBe('sess-free')
    expect(act.goals[0].objective.startsWith('这是一个超过四十字')).toBe(true)
    expect(act.goals[0].objective.endsWith('…')).toBe(true)
    expect(act.goals[0].objective.length).toBeLessThanOrEqual(41)
    expect(act.goals[0].roundsStarted).toBe(2)
    expect(act.goals[0].maxGoalRounds).toBe(5)
  })

  it('session/list 失败：会话维度降级留空，任务维度照常', async () => {
    createTask({ title: '任务A', prompt: 'p', actionType: '答疑', targetScope: '本机', actionLevel: 'L0' })
    transact(store => {
      const t = store.tasks.find(x => x.title === '任务A')!
      t.runs.push({ id: 'r1', status: '运行中', startedAt: new Date().toISOString(), sessionId: 's1', trigger: '手动' } as never)
    })
    const gateway = {
      invoke: async (spec: { method: string }) => {
        if (spec.method === 'list') throw new Error('gateway down')
        return { records: [] }
      },
      stream: async () => { throw new Error('no stream') },
    }
    const service = new TaskBoardService(gateway)
    await service.refreshActivity()
    const act = service.activityView()
    expect(act.freeSessions).toEqual([])
    expect(act.runningTasks).toHaveLength(1)
  })
})

describe('task_delegate（对话内下单）', () => {
  interface ToolRegistrationLike {
    name: string
    output: { schema: { properties: Record<string, unknown> } }
    execute: (args: unknown, exec?: unknown) => Promise<unknown>
  }
  async function registerTools(): Promise<Map<string, ToolRegistrationLike>> {
    const registered = new Map<string, ToolRegistrationLike>()
    const mod = await import('../src/tools.ts')
    mod.apply({ tools: { register: (tool: ToolRegistrationLike) => { registered.set(tool.name, tool) } } } as never)
    return registered
  }

  it('工具返回键必须全部在声明的 output schema 内（回归：宿主按 additionalProperties:false 校验，多余键即拒）', async () => {
    const registered = await registerTools()
    const delegate = registered.get('task_delegate')!
    expect(delegate).toBeDefined()
    const declared = new Set(Object.keys(delegate.output.schema.properties))
    injectServiceGetter(() => ({
      createWithGovernance: async () => ({ id: 'TB-x', title: 't' }),
      run: async () => ({ status: '运行中' }),
    }) as never)
    const out = (await delegate.execute({
      title: 't', prompt: 'p', action_type: '答疑', target_scope: '本机', action_level: 'L0',
    }, { agent: { id: 'session-test-1' } })) as Record<string, unknown>
    for (const key of Object.keys(out)) {
      expect(declared.has(key), `返回键 ${key} 未在 output schema 中声明`).toBe(true)
    }
  })

  it('立项即预裁决 + run_now 立即执行', async () => {
    const created: Array<Record<string, unknown>> = []
    const runs: Array<string> = []
    injectServiceGetter(() => ({
      createWithGovernance: async (input: Record<string, unknown>) => { created.push(input); return { id: 'TB-1', title: input.title as string } },
      run: async (id: string) => { runs.push(id); return { status: '运行中' } },
    }) as never)
    const registered = await registerTools()
    const delegate = registered.get('task_delegate')
    expect(delegate).toBeDefined()
    const exec = { agent: { id: 'session-test-1' } }
    const out = (await delegate!.execute({
      title: '整理周报', prompt: '把本周记忆整理成周报', action_type: '整理汇报', target_scope: '本机',
      action_level: 'L1', run_now: true,
    }, exec)) as { ok: boolean; task_id: string; action_level: string; run_status: string }
    expect(out.ok).toBe(true)
    expect(out.task_id).toBe('TB-1')
    expect(out.run_status).toBe('运行中')
    expect(created[0].actionLevel).toBe('L1')
    expect(runs).toEqual(['TB-1'])
  })

  it('外发/破坏性动词强制提升级别（安全审计 H1）', async () => {
    const created: Array<Record<string, unknown>> = []
    injectServiceGetter(() => ({
      createWithGovernance: async (input: Record<string, unknown>) => { created.push(input); return { id: 'TB-x', title: input.title as string } },
      run: async () => ({ status: '运行中' }),
    }) as never)
    const registered = await registerTools()
    const delegate = registered.get('task_delegate')!
    const exec = { agent: { id: 'session-test-1' } }
    const out1 = (await delegate.execute({
      title: '发布公告', prompt: '向全员群发通知', action_type: '答疑', target_scope: '外部',
      action_level: 'L0', run_now: false,
    }, exec)) as { action_level: string }
    expect(out1.action_level).toBe('L2') // 外发动词：L0 申报强制升 L2
    const out2 = (await delegate.execute({
      title: '清理数据', prompt: '删除数据中的全部旧记录', action_type: '答疑', target_scope: '外部',
      action_level: 'L0', run_now: false,
    }, exec)) as { action_level: string }
    expect(out2.action_level).toBe('L3') // 破坏性动词：强制 L3
    expect(created[0].actionLevel).toBe('L2') // out1 外发动词升 L2
    expect(created[1].actionLevel).toBe('L3') // out2 破坏性动词升 L3
  })

  it('cron 任务默认不立即执行', async () => {
    const runs: Array<string> = []
    injectServiceGetter(() => ({
      createWithGovernance: async (input: Record<string, unknown>) => ({ id: 'TB-2', title: input.title as string }),
      run: async (id: string) => { runs.push(id); return { status: '运行中' } },
    }) as never)
    const registered = await registerTools()
    const out = (await registered.get('task_delegate')!.execute({
      title: '每天晨报', prompt: '生成晨报', action_type: '整理汇报', target_scope: '本机',
      action_level: 'L0', cron: '0 8 * * *', run_now: false,
    }, { agent: { id: 'session-test-1' } })) as { ok: boolean; run_status: string }
    expect(out.ok).toBe(true)
    expect(out.run_status).toBe('未执行（run_now=false）')
    expect(runs).toEqual([])
  })

  it('缺调用方身份/看板服务缺席：执行抛错（fail-closed，不静默假装立项）', async () => {
    injectServiceGetter(undefined)
    const registered = await registerTools()
    await expect(registered.get('task_delegate')!.execute({
      title: 'x', prompt: 'y', action_type: '答疑', target_scope: '本机', action_level: 'L0',
    })).rejects.toThrow('必须在 agent 会话内调用')
    await expect(registered.get('task_delegate')!.execute({
      title: 'x', prompt: 'y', action_type: '答疑', target_scope: '本机', action_level: 'L0',
    }, { agent: { id: 'session-test-1' } })).rejects.toThrow('看板服务不可用')
  })
})

describe('task_approve（对话内批准，主任拍板）', () => {
  async function registerApproveTool(): Promise<{ execute: (args: unknown, exec?: unknown) => Promise<unknown> }> {
    const registered = new Map<string, { execute: (args: unknown, exec?: unknown) => Promise<unknown> }>()
    const mod = await import('../src/tools.ts')
    mod.apply({ tools: { register: (tool: { name: string; execute: (args: unknown, exec?: unknown) => Promise<unknown> }) => { registered.set(tool.name, tool) } } } as never)
    const approve = registered.get('task_approve')
    if (approve === undefined) throw new Error('task_approve 未注册')
    return approve
  }

  function seedBlockedTask(execSessionId: string): { taskId: string; ledgerRecordId: string } {
    const t = createTask({ title: '【测试】L2 待审批任务', prompt: 'p', actionType: '发布内容', targetScope: '外部', actionLevel: 'L2' })
    transact(store => {
      const task = store.tasks.find(x => x.id === t.id)!
      task.runs.push({ id: 'r-blocked', status: '待审批', startedAt: new Date().toISOString(), trigger: '手动', ledgerRecordId: 'A-TEST-1', sessionId: execSessionId } as never)
    })
    return { taskId: t.id, ledgerRecordId: 'A-TEST-1' }
  }

  it('批准待审批令牌并自动重跑（调用会话 ≠ 执行会话，防自批通过）', async () => {
    const { taskId, ledgerRecordId } = seedBlockedTask('session-exec-1')
    const approvedIds: string[] = []
    const reruns: string[] = []
    // 账本 fake：pending 含目标令牌；approve 幂等落账
    const { injectLedgerGetter } = await import('../src/governance.ts')
    injectLedgerGetter(() => ({
      check: () => { throw new Error('不应被调用') },
      fillResult: () => ({ ok: true }),
      approve: (id: string) => { approvedIds.push(id); return { ok: true, grant: { id: 'G-TEST' }, record: { id: ledgerRecordId } } },
      pendingApprovals: () => [{ id: 'P-TEST', recordId: ledgerRecordId, state: '待批准', expiresAt: new Date(Date.now() + 60_000).toISOString() }],
    }) as never)
    injectServiceGetter(() => ({
      createWithGovernance: async () => ({ id: 'TB-x', title: 'x' }),
      run: async (id: string) => { reruns.push(id); return { status: '运行中' } },
    }) as never)
    const approve = await registerApproveTool()
    const out = (await approve.execute({ task_id: taskId }, { agent: { id: 'session-master-1' } })) as { ok: boolean; task_id: string; grant_id: string; run_status: string }
    expect(out.ok).toBe(true)
    expect(out.task_id).toBe(taskId)
    expect(out.grant_id).toBe('G-TEST')
    expect(out.run_status).toBe('运行中')
    expect(approvedIds).toEqual(['P-TEST'])
    expect(reruns).toEqual([taskId])
  })

  it('防自批：调用会话 = 执行会话 → 拒绝', async () => {
    const { taskId } = (await import('../src/ledger.ts')) && seedBlockedTask('session-exec-1')
    const { injectLedgerGetter } = await import('../src/governance.ts')
    injectLedgerGetter(() => ({
      check: () => { throw new Error('不应被调用') },
      fillResult: () => ({ ok: true }),
      approve: () => { throw new Error('不应被调用') },
      pendingApprovals: () => [{ id: 'P-X', recordId: 'A-X', state: '待批准' }],
    }) as never)
    injectServiceGetter(() => ({ run: async () => ({ status: '运行中' }) }) as never)
    const approve = await registerApproveTool()
    await expect(approve.execute({ task_id: taskId }, { agent: { id: 'session-exec-1' } })).rejects.toThrow('防自批')
  })

  it('账本缺席 → 报错不静默', async () => {
    const { taskId } = seedBlockedTask('session-exec-1')
    injectLedgerGetter(() => undefined)
    injectServiceGetter(() => ({ run: async () => ({ status: '运行中' }) }) as never)
    const approve = await registerApproveTool()
    await expect(approve.execute({ task_id: taskId }, { agent: { id: 'session-master' } })).rejects.toThrow('账本服务不可用')
  })
})

describe('task_claim（对话内认领执行，主任拍板）', () => {
  async function registerClaimTool(): Promise<{ execute: (args: unknown, exec?: unknown) => Promise<unknown> }> {
    const registered = new Map<string, { execute: (args: unknown, exec?: unknown) => Promise<unknown> }>()
    const mod = await import('../src/tools.ts')
    mod.apply({ tools: { register: (tool: { name: string; execute: (args: unknown, exec?: unknown) => Promise<unknown> }) => { registered.set(tool.name, tool) } } } as never)
    const claim = registered.get('task_claim')
    if (claim === undefined) throw new Error('task_claim 未注册')
    return claim
  }

  it('L1 任务认领：放行并绑定调用会话（claimed run 运行中）', async () => {
    const t = createTask({ title: '【测试】开发任务', prompt: 'p', actionType: '开发', targetScope: '本机仓库', actionLevel: 'L1' })
    injectServiceGetter(() => new TaskBoardService({ invoke: async () => ({}) } as never) as never)
    const claim = await registerClaimTool()
    const out = (await claim.execute({ task_id: t.id }, { agent: { id: 'session-master-1' } })) as { ok: boolean; run_status: string }
    expect(out.ok).toBe(true)
    expect(out.run_status).toBe('运行中')
    const st = await import('../src/ledger.ts')
    const task = st.loadBoard().tasks.find(x => x.id === t.id)!
    expect(task.column).toBe('进行中')
    expect(task.runs[0].sessionId).toBe('session-master-1')
    expect(task.runs[0].claimed).toBe(true)
  })

  it('L3 禁区任务：认领即拒绝（本地降级）', async () => {
    const t = createTask({ title: '【测试】L3 禁区', prompt: 'p', actionType: '转账', targetScope: '外部', actionLevel: 'L3' })
    injectServiceGetter(() => new TaskBoardService({ invoke: async () => ({}) } as never) as never)
    const claim = await registerClaimTool()
    const out = (await claim.execute({ task_id: t.id }, { agent: { id: 'session-master-1' } })) as { ok: boolean; run_status: string }
    expect(out.ok).toBe(true)
    expect(out.run_status).toBe('已阻断')
  })

  it('执行现场接管：他会话的运行中执行 → 新会话认领即接管（旧现场取消留审计）', async () => {
    const t = createTask({ title: '【测试】跨会话接管', prompt: 'p', actionType: '开发', targetScope: '本机', actionLevel: 'L1' })
    injectServiceGetter(() => new TaskBoardService({ invoke: async () => ({}) } as never) as never)
    const claim = await registerClaimTool()
    const first = (await claim.execute({ task_id: t.id }, { agent: { id: 's1' } })) as { run_status: string }
    expect(first.run_status).toBe('运行中')
    // 会话压缩/实例更替：新会话 s2 认领同一任务 → 接管而非拒绝
    const second = (await claim.execute({ task_id: t.id }, { agent: { id: 's2' } })) as { run_status: string }
    expect(second.run_status).toBe('运行中')
    const st = await import('../src/ledger.ts')
    const task = st.loadBoard().tasks.find(x => x.id === t.id)!
    const cancelled = task.runs.filter(r => r.status === '已取消')
    expect(cancelled).toHaveLength(1)
    expect(cancelled[0].summary).toContain('接管')
    expect(task.runs[task.runs.length - 1].sessionId).toBe('s2')
  })

  it('同会话重复认领 → 已阻断（执行现场已在你手上）', async () => {
    const t = createTask({ title: '【测试】同会话重复', prompt: 'p', actionType: '开发', targetScope: '本机', actionLevel: 'L1' })
    injectServiceGetter(() => new TaskBoardService({ invoke: async () => ({}) } as never) as never)
    const claim = await registerClaimTool()
    const first = (await claim.execute({ task_id: t.id }, { agent: { id: 's1' } })) as { run_status: string }
    expect(first.run_status).toBe('运行中')
    const second = (await claim.execute({ task_id: t.id }, { agent: { id: 's1' } })) as { run_status: string }
    expect(second.run_status).toBe('已阻断')
  })

  it('认领成功的返回值不得携带 undefined 属性（回归：宿主 lossless JSON 校验整包拒绝）', async () => {
    const t = createTask({ title: '【测试】无摘要认领', prompt: 'p', actionType: '开发', targetScope: '本机', actionLevel: 'L1' })
    injectServiceGetter(() => new TaskBoardService({ invoke: async () => ({}) } as never) as never)
    const claim = await registerClaimTool()
    const out = (await claim.execute({ task_id: t.id }, { agent: { id: 's1' } })) as Record<string, unknown>
    for (const [k, v] of Object.entries(out)) {
      expect(v, `字段 ${k} 为 undefined——lossless JSON 校验会整包拒绝`).not.toBeUndefined()
    }
    // 被治理拦截的认领（带 summary）也全字段有值
    const t2 = createTask({ title: '【测试】L3 拒绝认领', prompt: 'p', actionType: '转账', targetScope: '外部', actionLevel: 'L3' })
    const out2 = (await claim.execute({ task_id: t2.id }, { agent: { id: 's1' } })) as Record<string, unknown>
    for (const [k, v] of Object.entries(out2)) {
      expect(v, `字段 ${k} 为 undefined`).not.toBeUndefined()
    }
  })
})

describe('启动对账（settleOrphanedRuns）', () => {
  async function registerClaimTool(): Promise<{ execute: (args: unknown, exec?: unknown) => Promise<unknown> }> {
    const registered = new Map<string, { execute: (args: unknown, exec?: unknown) => Promise<unknown> }>()
    const mod = await import('../src/tools.ts')
    mod.apply({ tools: { register: (tool: { name: string; execute: (args: unknown, exec?: unknown) => Promise<unknown> }) => { registered.set(tool.name, tool) } } } as never)
    const claim = registered.get('task_claim')
    if (claim === undefined) throw new Error('task_claim 未注册')
    return claim
  }

  it('自动归档：已完成满 7 天归档；已失败/待办永不自动归档（P1 主任拍板）', async () => {
    const { createTask: ct, transact: tx, loadBoard: lb } = await import('../src/ledger.ts')
    const done = ct({ title: '【测试】完成8天', prompt: 'p', actionType: '开发', targetScope: '本机', actionLevel: 'L1' })
    const doneFresh = ct({ title: '【测试】完成1天', prompt: 'p', actionType: '开发', targetScope: '本机', actionLevel: 'L1' })
    const failed = ct({ title: '【测试】失败8天', prompt: 'p', actionType: '开发', targetScope: '本机', actionLevel: 'L1' })
    const pending = ct({ title: '【测试】待办8天', prompt: 'p', actionType: '开发', targetScope: '本机', actionLevel: 'L1' })
    const old = new Date(Date.now() - 8 * 86_400_000).toISOString()
    const fresh = new Date(Date.now() - 1 * 86_400_000).toISOString()
    tx(store => {
      const d = store.tasks.find(x => x.id === done.id)!; d.column = '已完成'; d.updatedAt = old
      const f = store.tasks.find(x => x.id === doneFresh.id)!; f.column = '已完成'; f.updatedAt = fresh
      const fl = store.tasks.find(x => x.id === failed.id)!; fl.column = '已失败'; fl.updatedAt = old
      const p = store.tasks.find(x => x.id === pending.id)!; p.column = '待办'; p.updatedAt = old
    })
    const svc = new TaskBoardService({ invoke: async () => ({}) } as never)
    await svc.tick()
    const board = lb()
    expect(board.tasks.find(x => x.id === done.id)?.archived).toBe(true)
    expect(board.tasks.find(x => x.id === doneFresh.id)?.archived).toBeUndefined()
    expect(board.tasks.find(x => x.id === failed.id)?.archived).toBeUndefined()
    expect(board.tasks.find(x => x.id === pending.id)?.archived).toBeUndefined()
  })

  it('上一进程遗留的「运行中」run 一律结算为已取消，解除认领/上报卡死', async () => {
    const { createTask: ct, transact: tx, loadBoard: lb } = await import('../src/ledger.ts')
    const t = ct({ title: '【测试】重启遗留', prompt: 'p', actionType: '开发', targetScope: '本机', actionLevel: 'L1' })
    tx(store => {
      const task = store.tasks.find(x => x.id === t.id)!
      task.runs.push({ id: 'RUN-orphan', status: '运行中', startedAt: new Date().toISOString(), trigger: '手动', sessionId: 'session-dead' } as never)
      task.column = '进行中'
    })
    const svc = new TaskBoardService({ invoke: async () => ({}) } as never)
    const n = svc.settleOrphanedRuns()
    expect(n).toBe(1)
    const task = lb().tasks.find(x => x.id === t.id)!
    expect(task.runs[0].status).toBe('已取消')
    expect(task.runs[0].summary).toContain('宿主重启')
    expect(task.column).toBe('待办')
    // 结算后即可正常认领（不再被并发防护卡死）
    injectServiceGetter(() => svc as never)
    const claim = await registerClaimTool()
    const out = (await claim.execute({ task_id: t.id }, { agent: { id: 'session-new' } })) as { run_status: string }
    expect(out.run_status).toBe('运行中')
  })
})
