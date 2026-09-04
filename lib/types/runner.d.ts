/**
 * 执行器：把任务投递给真实的分身会话。
 *
 * 执行链（fail-closed，借鉴外部实现的钉扎纪律）：
 * 1. 校验执行预设存在且未 broken（agentPresets/list）——固定 digital-twin，
 *    分身是唯一的任务执行身份（决策五：预设统一，全工具分身）
 * 2. session/create（钉 workspace + 预设）
 * 3. session/rename（会话名 = 任务标题，便于回溯）
 * 4. session/prompt（mode=queue 投递任务提示词）
 *
 * 完成判定（inspect）：session/list 看会话不在运行 → session/page 回溯找
 * turn/end（时间不早于启动时刻）→ turn/end 带 error 即失败，否则成功；
 * 会话消失 = 已取消；找不到边界 = 仍在进行。
 */
import { GatewayClient, type TypertGateway } from './gateway.ts';
import type { TaskRecord } from './ledger.ts';
export declare const EXECUTION_PRESET = "digital-twin";
export type ExecutionOutcome = {
    outcome: 'pending';
} | {
    outcome: 'succeeded';
} | {
    outcome: 'failed';
    error: string;
} | {
    outcome: 'cancelled';
    error: string;
};
export declare class LaunchError extends Error {
    readonly sessionId: string | undefined;
    constructor(sessionId: string | undefined, message: string);
}
export declare class TaskRunner {
    /** 执行预设 id；缺省 digital-twin（决策五：分身是唯一执行身份） */
    private readonly presetId;
    private readonly gateway;
    private readonly scanMemos;
    constructor(gateway: GatewayClient | TypertGateway, 
    /** 执行预设 id；缺省 digital-twin（决策五：分身是唯一执行身份） */
    presetId?: string);
    /** 投递任务：返回执行会话 id。任何一步失败都抛错（fail-closed，不静默降级）。 */
    launch(task: TaskRecord): Promise<string>;
    /** 定时触发与手动共用同一投递链路，仅来源声明不同。 */
    launchScheduled(task: TaskRecord): Promise<string>;
    /** 完成判定：会话结束运行后回溯事件找 turn/end。 */
    inspect(sessionId: string, startedAt: number): Promise<ExecutionOutcome>;
}
