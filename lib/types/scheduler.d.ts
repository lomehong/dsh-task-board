import type { TaskRecord } from './ledger.ts';
/** 找出本次 tick 需要触发的任务（并原子推进 lastMinuteKey 防重）。 */
export declare function collectDueTasks(now: Date): TaskRecord[];
