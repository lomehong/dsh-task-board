/**
 * goal 折叠测试（L2 结算感知 / L1 活动汇聚的数据面）：
 * - last-wins 折叠 goal/change 事件（数组序，宿主单页升序）；
 * - clear 墓碑（无 goal 字段）→ cleared，不残留旧相位（High-2）；
 * - 无 goal/change 事件 → undefined。
 */
import { describe, expect, it } from 'vitest'
import { foldGoalFromRecords, goalCreateSpec, GOAL_ROUNDS_BY_LEVEL } from '../src/goals.ts'

function changeEvent(seq: number, phase: string, objective = '目标', blockedMessage?: string) {
  return {
    event: {
      type: 'goal/change', seq, time: seq,
      data: {
        kind: 'goal/change', version: 1, operation: 'update',
        goal: {
          id: 'g1', revision: seq, phase, objective, maxGoalRounds: 5,
          ...(blockedMessage !== undefined ? { blockedReason: { code: 'test', message: blockedMessage } } : {}),
        },
        roundsStarted: 2, createdAt: 1, updatedAt: seq,
      },
    },
  }
}

function clearEvent(seq: number) {
  return {
    event: {
      type: 'goal/change', seq, time: seq,
      data: { kind: 'goal/change', version: 1, operation: 'clear' },
    },
  }
}

describe('foldGoalFromRecords', () => {
  it('无 goal/change 事件 → undefined', () => {
    expect(foldGoalFromRecords([
      { event: { type: 'turn/end', seq: 1, time: 1, data: {} } },
    ])).toBeUndefined()
    expect(foldGoalFromRecords([])).toBeUndefined()
  })

  it('last-wins：取数组序最后一条 goal/change', () => {
    const folded = foldGoalFromRecords([
      changeEvent(3, 'active', '旧状态'),
      { event: { type: 'turn/end', seq: 4, time: 4, data: {} } },
      changeEvent(5, 'blocked', '新状态', '等待外部依赖'),
    ])
    expect(folded?.status).toBe('current')
    if (folded?.status !== 'current') return
    expect(folded.phase).toBe('blocked')
    expect(folded.objective).toBe('新状态')
    expect(folded.blockedMessage).toBe('等待外部依赖')
    expect(folded.roundsStarted).toBe(2)
    expect(folded.maxGoalRounds).toBe(5)
  })

  it('clear 墓碑（High-2）：清除后不残留旧相位', () => {
    const folded = foldGoalFromRecords([
      changeEvent(3, 'active', '进行中目标'),
      clearEvent(6),
    ])
    expect(folded?.status).toBe('cleared')
  })

  it('clear 后又 create：回到 current', () => {
    const folded = foldGoalFromRecords([
      changeEvent(3, 'active', '第一轮目标'),
      clearEvent(6),
      changeEvent(8, 'active', '第二轮目标'),
    ])
    expect(folded?.status).toBe('current')
    if (folded?.status === 'current') expect(folded.objective).toBe('第二轮目标')
  })

  it('phase 白名单外的 change 被忽略', () => {
    const folded = foldGoalFromRecords([
      changeEvent(1, 'stopped' as string, '异常相位'),
      changeEvent(2, 'complete', '已完成目标'),
    ])
    expect(folded?.status).toBe('current')
    if (folded?.status === 'current') expect(folded.phase).toBe('complete')
  })
})

describe('goalCreateSpec', () => {
  it('生成 goals/create 远程规格（agentId=会话 id）', () => {
    const spec = goalCreateSpec('session-1', '做某事', 3)
    expect(spec).toEqual({
      namespace: 'goals', method: 'create',
      args: { agentId: 'session-1', request: { objective: '做某事', maxGoalRounds: 3 } },
    })
  })

  it('轮次预算映射：L1=2 / L2=3 / L0 与 L3 不播种', () => {
    expect(GOAL_ROUNDS_BY_LEVEL.L1).toBe(2)
    expect(GOAL_ROUNDS_BY_LEVEL.L2).toBe(3)
    expect(GOAL_ROUNDS_BY_LEVEL.L0).toBeUndefined()
    expect(GOAL_ROUNDS_BY_LEVEL.L3).toBeUndefined()
  })
})
