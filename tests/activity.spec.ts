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
      stream: async () => { throw new Error('测试无事件流') },
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
  async function registerTools(): Promise<Map<string, { execute: (args: unknown, exec?: unknown) => Promise<unknown> }>> {
    const registered = new Map<string, { execute: (args: unknown, exec?: unknown) => Promise<unknown> }>()
    const mod = await import('../src/tools.ts')
    mod.apply({ tools: { register: (tool: { name: string; execute: (args: unknown, exec?: unknown) => Promise<unknown> }) => { registered.set(tool.name, tool) } } } as never)
    return registered
  }

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
    const out = (await delegate!.execute({
      title: '整理周报', prompt: '把本周记忆整理成周报', action_type: '整理汇报', target_scope: '本机',
      action_level: 'L1', run_now: true,
    })) as { ok: boolean; task_id: string; run_status: string }
    expect(out.ok).toBe(true)
    expect(out.task_id).toBe('TB-1')
    expect(out.run_status).toBe('运行中')
    expect(created[0].actionLevel).toBe('L1')
    expect(runs).toEqual(['TB-1'])
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
    })) as { ok: boolean; run_status: string }
    expect(out.ok).toBe(true)
    expect(out.run_status).toBe('未执行（run_now=false）')
    expect(runs).toEqual([])
  })

  it('看板服务缺席：执行抛错（fail-closed，不静默假装立项）', async () => {
    injectServiceGetter(undefined)
    const registered = await registerTools()
    await expect(registered.get('task_delegate')!.execute({
      title: 'x', prompt: 'y', action_type: '答疑', target_scope: '本机', action_level: 'L0',
    })).rejects.toThrow('看板服务不可用')
  })
})
