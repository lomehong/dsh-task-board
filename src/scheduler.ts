/**
 * cron 调度器：每分钟 tick，遍历启用 cron 的未归档任务，命中即触发执行。
 *
 * 纪律：
 * - 同分钟去重（lastMinuteKey）——tick 频率高于 1/min 时不会重复触发
 * - 错过的时间点不补跑（lastMinuteKey 之后第一次命中才触发）
 * - 触发回调由调用方注入（service 层接 runner+governance），本模块只管「何时」
 */
import { cronMatches, minuteKey } from './cron.ts'
import { transact } from './ledger.ts'
import type { TaskRecord } from './ledger.ts'

/** 找出本次 tick 需要触发的任务（并原子推进 lastMinuteKey 防重）。 */
export function collectDueTasks(now: Date): TaskRecord[] {
  const due: TaskRecord[] = []
  const key = minuteKey(now)
  transact((store) => {
    for (const task of store.tasks) {
      if (task.archived === true) continue
      if (task.cron === undefined || task.cron === '') continue
      if (!cronMatches(task.cron, now)) continue
      if (task.lastMinuteKey === key) continue // 同分钟已触发
      task.lastMinuteKey = key
      due.push(task)
    }
  })
  return due
}
