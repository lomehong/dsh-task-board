/**
 * 任务记忆沉淀测试（决策五「记忆是经验积累」+ 主任拍板的验收语义：
 * 分身自报 ≠ 完成，主人确认才是完成）：
 * - task_report → 运行进入「待确认」（非终态），不自报即完成；
 * - 主任确认（confirmTaskResult）→ 落定终态 + 「已验证结果」记忆沉淀；
 * - dsh-memory 缺席 / 写入失败都不影响看板状态（显式降级，宪章 §3.2）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTask, transact, loadBoard } from '../src/ledger.ts'
import { reportTaskResult, confirmTaskResult } from '../src/report.ts'
import { injectMemoryGetter, type TaskMemoryModule } from '../src/memory.ts'

let home: string

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'task-board-memory-'))
  process.env.DSH_HOME = home
})

afterEach(() => {
  injectMemoryGetter(() => undefined)
  delete process.env.DSH_HOME
  rmSync(home, { recursive: true, force: true })
})

/** 建一个带「运行中」执行的任务（sessionId 固定，供 F-03 绑定校验通过）。 */
function seedRunningTask(): string {
  const t = createTask({ title: '【测试】周报汇总', prompt: '汇总', actionType: '答疑', targetScope: '本机', actionLevel: 'L0' })
  transact(store => {
    const task = store.tasks.find(x => x.id === t.id)
    if (task === undefined) return
    task.runs.push({
      id: 'run-1', status: '运行中', startedAt: new Date().toISOString(),
      sessionId: 'session-test-1', trigger: '手动',
    } as never)
  })
  return t.id
}

describe('任务记忆沉淀（自报 → 待确认 → 主任确认）', () => {
  it('自报后进入「待确认」，主任确认后落定终态并沉淀「已验证结果」记忆', async () => {
    const calls: Array<Record<string, unknown>> = []
    injectMemoryGetter(() => ({
      addMemoryEntry: (entry) => { calls.push(entry as Record<string, unknown>); return Promise.resolve({}) },
    }))
    const tid = seedRunningTask()
    const r = reportTaskResult(tid, { status: '成功', summary: '本周汇总完成', sessionId: 'session-test-1' })
    expect(r.ok).toBe(true)
    expect(r.task?.lastStatus).toBe('待确认')
    // 自报阶段不写记忆（等主任确认）
    expect(calls.length).toBe(0)
    const c = confirmTaskResult(tid, true)
    expect(c.ok).toBe(true)
    await vi.waitFor(() => expect(calls.length).toBe(1))
    const entry = calls[0] as { content: string; type: string; scope: string; author: string; authorRole: string; statementType: string; source: { origin: string; ref: string }; verify: { status: string } }
    expect(entry.content).toContain(tid)
    expect(entry.content).toContain('【测试】周报汇总')
    expect(entry.content).toContain('本周汇总完成')
    expect(entry.type).toBe('task')
    expect(entry.scope).toBe('master')
    expect(entry.authorRole).toBe('master')
    expect(entry.statementType).toBe('已验证结果')
    expect(entry.source.origin).toBe('task-board')
    expect(entry.source.ref).toBe(tid)
    expect(entry.verify.status).toBe('已验证')
    const board = loadBoard().tasks.find(x => x.id === tid)!
    expect(board.lastStatus).toBe('成功')
    expect(board.column).toBe('已完成')
  })

  it('主任驳回：自报结果被判失败', async () => {
    const tid = seedRunningTask()
    reportTaskResult(tid, { status: '成功', summary: '自报成功', sessionId: 'session-test-1' })
    const c = confirmTaskResult(tid, false)
    expect(c.ok).toBe(true)
    const board = loadBoard().tasks.find(x => x.id === tid)!
    expect(board.lastStatus).toBe('失败')
    expect(board.column).toBe('已失败')
  })

  it('dsh-memory 缺席：确认照常落定终态（显式降级不阻断）', async () => {
    injectMemoryGetter(() => undefined)
    const tid = seedRunningTask()
    reportTaskResult(tid, { status: '成功', summary: 'ok', sessionId: 'session-test-1' })
    const c = confirmTaskResult(tid, true)
    expect(c.ok).toBe(true)
    const board = loadBoard().tasks.find(x => x.id === tid)!
    expect(board.lastStatus).toBe('成功')
  })

  it('dsh-memory 写入抛错：确认不受影响', async () => {
    injectMemoryGetter(() => ({
      addMemoryEntry: () => Promise.reject(new Error('disk full')),
    }))
    const tid = seedRunningTask()
    reportTaskResult(tid, { status: '成功', summary: 'ok', sessionId: 'session-test-1' })
    const c = confirmTaskResult(tid, true)
    expect(c.ok).toBe(true)
    expect(c.task?.lastStatus).toBe('成功')
  })

  it('无待确认自报：确认幂等安全返回失败', async () => {
    const tid = seedRunningTask()
    const c = confirmTaskResult(tid, true)
    expect(c.ok).toBe(false)
    expect(c.error).toContain('没有待确认的自报结果')
  })
})
