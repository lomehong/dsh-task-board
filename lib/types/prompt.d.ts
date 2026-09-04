/**
 * 任务提示词组装。
 *
 * 执行声明（来源标识）：每条任务提示词都带一段来源声明——告诉执行的分身
 * 「这条指令来自任务看板、由主人布置」，防止把任务文本误当主人即时对话；
 * 也为将来的续接卡（FREEZE 快照）预留拼接位。
 */
export interface PromptInput {
    title: string;
    prompt: string;
    taskId: string;
    trigger: '手动' | '定时';
}
export declare function composePrompt(input: PromptInput): string;
