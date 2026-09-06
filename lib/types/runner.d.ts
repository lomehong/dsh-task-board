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
    goalPhase?: 'complete';
} | {
    outcome: 'failed';
    error: string;
    goalPhase?: 'blocked';
} | {
    outcome: 'cancelled';
    error: string;
};
export interface LaunchResult {
    sessionId: string;
    /** 已为执行会话播种原生 goal（播种失败/不适用级别为 false） */
    goalSeeded: boolean;
}
export declare class LaunchError extends Error {
    readonly sessionId: string | undefined;
    constructor(sessionId: string | undefined, message: string);
}
export declare class TaskRunner {
    /** 执行预设 id；缺省 digital-twin（决策五：分身是唯一执行身份） */
    private readonly presetId;
    private readonly gateway;
    constructor(gateway: GatewayClient | TypertGateway, 
    /** 执行预设 id；缺省 digital-twin（决策五：分身是唯一执行身份） */
    presetId?: string);
    /** 投递任务：返回执行会话与 goal 播种状态。投递失败抛错（fail-closed）；
     *  goal 播种失败降级（goalSeeded=false，结算退回 turn/end 语义）。
     *  @param trigger 来源声明（手动/定时）——写入投递提示词，让分身知道任务由谁触发。 */
    launch(task: TaskRecord, trigger?: '手动' | '定时'): Promise<LaunchResult>;
    /** 完成判定：先 follow 唤醒会话（订阅事件流驱动 agent 循环消费排队消息），再回溯事件找 turn/end。
     *  @param opts.goalSeeded 执行会话已播种原生 goal 时，turn/end 只代表一轮结束——
     *   以 goal 相位结算：active → 继续等（下一轮）、complete → 成功、blocked → 失败（含受阻原因）。
     *  @param opts.deferTurnEnd 会话认领执行（task_claim）时，turn/end 不结算——等 task_report
     *   上报（模型 finish turn ≠ 工作完成）；滞留由 stuck 兜底强制取消。 */
    inspect(sessionId: string, startedAt: number, opts?: {
        goalSeeded?: boolean;
        deferTurnEnd?: boolean;
    }): Promise<ExecutionOutcome>;
}
