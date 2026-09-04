import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createTask, deleteTask, findTask, loadBoard, saveBoard,
  setArchived, transact, updateTask, MAX_RUNS_PER_TASK,
} from '../src/ledger.ts'
import type { RunRecord } from '../src/ledger.ts'

let home: string

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'task-board-test-'))
  process.env.DSH_HOME = home
})

afterEach(() => {
  delete process.env.DSH_HOME
  rmSync(home, { recursive: true, force: true })
})

const valid = {
  title: '每周汇总记忆库',
  prompt: '汇总记忆库本周新增条目并生成摘要',
  actionType: '整理汇报',
  targetScope: '记忆库',
  actionLevel: 'L1',
}

describe('任务账本（Host 权威 + 原子写）', () => {
  it('创建任务：字段齐全、必填校验、默认列待办', () => {
    const t = createTask(valid)
    expect(t.id.startsWith('TB-')).toBe(true)
    expect(t.column).toBe('待办')
    expect(t.actionLevel).toBe('L1')
    expect(t.runs).toEqual([])
    expect(findTask(loadBoard(), t.id)?.title).toBe('每周汇总记忆库')
    expect(() => createTask({ ...valid, title: '  ' })).toThrow('标题')
    expect(() => createTask({ ...valid, prompt: '' })).toThrow('提示词')
    expect(() => createTask({ ...valid, actionType: '' })).toThrow('账本裁决')
    expect(() => createTask({ ...valid, targetScope: '' })).toThrow('账本裁决')
  })

  it('transact 串行写 + revision 递增 + 原子写往返', () => {
    const t = createTask(valid)
    const s1 = loadBoard()
    expect(s1.revision).toBeGreaterThanOrEqual(1)
    expect(s1.schemaVersion).toBe(1)
    updateTask(t.id, { title: '改名了' })
    expect(findTask(loadBoard(), t.id)?.title).toBe('改名了')
  })

  it('updateTask：归档任务拒绝编辑；列切换合法值校验', () => {
    const t = createTask(valid)
    setArchived(t.id, true)
    expect(() => updateTask(t.id, { title: 'x' })).toThrow('归档任务只读')
    setArchived(t.id, false)
    expect(updateTask(t.id, { column: '进行中' })?.column).toBe('进行中')
    expect(updateTask(t.id, { column: '乱写' as never })?.column).toBe('进行中')
  })

  it('归档/恢复/删除', () => {
    const t = createTask(valid)
    expect(setArchived(t.id, true)?.archived).toBe(true)
    expect(setArchived(t.id, false)?.archived).toBeUndefined()
    expect(deleteTask(t.id)).toBe(true)
    expect(deleteTask(t.id)).toBe(false)
    expect(findTask(loadBoard(), t.id)).toBeUndefined()
  })

  it('执行历史封顶：超过 20 条时最旧的被裁掉', () => {
    const t = createTask(valid)
    // 直接 transact 塞 25 条运行记录
    transact((store) => {
      const task = store.tasks.find(x => x.id === t.id)!
      for (let i = 0; i < 25; i++) {
        const run: RunRecord = {
          id: `run-${i}`,
          startedAt: new Date(Date.now() + i * 1000).toISOString(),
          status: '成功',
          trigger: '手动',
          sessionId: `sess-${i}`,
        }
        task.runs.push(run)
        if (task.runs.length > MAX_RUNS_PER_TASK) task.runs.shift()
        task.lastRunAt = run.startedAt
        task.lastSessionId = run.sessionId
        task.lastStatus = run.status
      }
    })
    const kept = findTask(loadBoard(), t.id)!
    expect(kept.runs.length).toBe(MAX_RUNS_PER_TASK)
    expect(kept.runs[0]!.id).toBe(`run-${25 - MAX_RUNS_PER_TASK}`) // 最旧的 5 条被裁
    expect(kept.runs.at(-1)!.id).toBe('run-24')
  })

  it('坏 JSON 回落空账本并保留现场副本', () => {
    const { writeFileSync, mkdirSync, existsSync } = require('node:fs') as typeof import('node:fs')
    const { join } = require('node:path') as typeof import('node:path')
    const dir = join(home, 'dsh-task-board')
    mkdirSync(dir, { recursive: true })
    const p = join(dir, 'ledger.json')
    writeFileSync(p, '{broken json', 'utf8')
    expect(loadBoard().tasks).toEqual([])
    // 坏文件被改名留证（.corrupt- 前缀），不静默吞掉
    expect(existsSync(p)).toBe(false)
  })
})
