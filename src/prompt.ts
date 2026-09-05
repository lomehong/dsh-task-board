/**
 * 任务提示词组装。
 *
 * 执行声明（来源标识）：每条任务提示词都带一段来源声明——告诉执行的分身
 * 「这条指令来自任务看板、由主人布置」，防止把任务文本误当主人即时对话；
 * 也为将来的续接卡（FREEZE 快照）预留拼接位。
 */

export interface PromptInput {
  title: string
  prompt: string
  taskId: string
  trigger: '手动' | '定时'
}

export function composePrompt(input: PromptInput): string {
  const body = input.prompt !== '' ? input.prompt : input.title
  return [
    `【任务看板执行】任务 ${input.taskId}（${input.trigger}触发）`,
    `任务标题：${input.title}`,
    '',
    body,
    '',
    '（本条消息由任务看板自动投递，非主人即时输入。执行约定：',
    '1. 完成后用 task_report 工具上报结果——status 填 成功/失败，summary 写给主任看的结果摘要；',
    '2. 过程中拆解步骤用 todo/goal 等会话层工具即可，属会话内脚手架，无需回写看板；',
    `3. 如需把部分工作委派给远端协作者，用御驿任务工具（yuyi_task_attach 等）并沿用任务号 ${input.taskId}，看板与协同面板均可追溯。）`,
  ].join('\n')
}
