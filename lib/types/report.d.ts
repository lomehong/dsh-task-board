/**
 * 执行结果上报（模型侧 → 看板）：task_report 工具的落地实现。
 *
 * 设计：分身会话在执行看板任务时调用 task_report，把**模型自己声明的**
 * 结果状态与摘要回填到最新的「运行中」执行记录，并联动任务列与账本留痕。
 * 上报即终态——运行记录立即落定，tick 的 turn/end 推断降级为
 * 「模型未上报时」的兜底（消除自由文本没人消费、宿主模板句回填的断点）。
 *
 * 本模块与宿主入口共享同一 ledger.ts 单写者事务（同模块单例），
 * 多进程并发由文件锁 + 原子重命名兜底（同 memory-store 约定）。
 */
import { type TaskRecord, type RunRecord } from './ledger.ts';
/** 上报状态：任务级二元终态（部分完成以 summary 说明，状态按实际达成填）。 */
export type ReportStatus = '成功' | '失败';
export interface ReportInput {
    status: ReportStatus;
    summary: string;
    /** 调用方会话 id（防伪造：必须与任务运行记录的执行会话一致） */
    sessionId: string;
}
export interface ReportOutcome {
    ok: boolean;
    error?: string;
    task?: TaskRecord;
    run?: RunRecord;
}
/**
 * 上报执行结果：定位该任务最新的「运行中」执行记录并落定终态。
 * 账本记录在位时同步回填模型真实摘要（替代宿主模板句）。
 *
 * @param taskId - 看板任务 id（投递提示词中携带）。
 * @param input - status + summary + 调用方会话 id。
 * @returns 上报结果；任务不存在、无进行中执行或会话与执行会话不一致时 ok=false。
 */
export declare function reportTaskResult(taskId: string, input: ReportInput): ReportOutcome;
