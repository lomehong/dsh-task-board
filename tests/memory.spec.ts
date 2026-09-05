/**
 * 任务记忆沉淀测试（决策五「记忆是经验积累」+ G-04 memory 测试设施）：
 * - reportTaskResult 落定终态时，任务结果以「已验证结果」写入 dsh-memory；
 * - dsh-memory 缺席 / 写入失败都不影响看板终态（显式降级，宪章 §3.2）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTask, transact } from '../src/ledger.ts'
import { reportTaskResult } from '../src/report.ts'
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

describe('任务记忆沉淀', () => {
  it('task_report 落定后把结果写为「已验证结果」记忆', async () => {
    const calls: Array<Record<string, unknown>> = []
    injectMemoryGetter(() => ({
      addMemoryEntry: (entry) => { calls.push(entry as Record<string, unknown>); return Promise.resolve({}) },
    }))
    const tid = seedRunningTask()
    const r = reportTaskResult(tid, { status: '成功', summary: '本周汇总完成', sessionId: 'session-test-1' })
    expect(r.ok).toBe(true)
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
  })

  it('dsh-memory 缺席：结算照常成功（显式降级不阻断）', () => {
    injectMemoryGetter(() => undefined)
    const tid = seedRunningTask()
    const r = reportTaskResult(tid, { status: '成功', summary: 'ok', sessionId: 'session-test-1' })
    expect(r.ok).toBe(true)
    expect(r.task?.column).toBe('已完成')
  })

  it('dsh-memory 写入抛错：看板终态不受影响', async () => {
    injectMemoryGetter(() => ({
      addMemoryEntry: () => Promise.reject(new Error('disk full')),
    }))
    const tid = seedRunningTask()
    const r = reportTaskResult(tid, { status: '失败', summary: '目标目录不存在', sessionId: 'session-test-1' })
    expect(r.ok).toBe(true)
    expect(r.task?.lastStatus).toBe('失败')
    // 等待 fire-and-forget 的写入链路走完，确认没有未处理拒绝
    await vi.waitFor(() => expect(r.task?.lastStatus).toBe('失败'))
  })

  it('getter 注入的 addMemoryEntry 缺失（服务形态不全）：跳过不炸', () => {
    injectMemoryGetter(() => ({}) as TaskMemoryModule)
    const tid = seedRunningTask()
    const r = reportTaskResult(tid, { status: '成功', summary: 'ok', sessionId: 'session-test-1' })
    expect(r.ok).toBe(true)
  })
})
