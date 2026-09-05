import { reportTaskResult } from './report.js';
export const name = 'tool-task-board';
export const inject = ['tools'];
export function apply(ctx) {
    const host = ctx;
    const tools = host.tools ?? host.get?.('tools');
    if (tools === undefined || typeof tools.register !== 'function')
        return;
    try {
        tools.register({
            name: 'task_report',
            description: '上报当前看板任务的执行结果（状态 + 给主任看的摘要）。看板投递的任务提示词中带有任务号；' +
                '上报后任务即落定终态，主任在任务看板看到的就是你在这里写的摘要——请如实、具体。',
            parameters: {
                type: 'object',
                additionalProperties: false,
                required: ['task_id', 'status', 'summary'],
                properties: {
                    task_id: { type: 'string', description: '看板任务号（投递提示词中携带，如 TB-…）' },
                    status: { type: 'string', enum: ['成功', '失败'], description: '执行结果状态' },
                    summary: { type: 'string', description: '结果摘要（主任直接阅读；含关键产出/结论/未决事项）' },
                },
            },
            output: {
                schema: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        ok: { type: 'boolean', description: '是否上报成功' },
                        error: { type: 'string', description: '失败原因（成功时缺失）' },
                    },
                },
                render: (_args, value) => {
                    const v = value;
                    if (v.ok !== true)
                        return [{ type: 'text', text: `上报失败：${v.error ?? '未知原因'}` }];
                    return [{ type: 'text', text: '结果已上报任务看板，主任可在看板中查看。' }];
                },
            },
            execute: async (args) => {
                const a = (args ?? {});
                if (typeof a.task_id !== 'string' || a.task_id === '')
                    throw new Error('task_id 必填');
                if (a.status !== '成功' && a.status !== '失败')
                    throw new Error('status 必须是 成功 或 失败');
                if (typeof a.summary !== 'string' || a.summary.trim() === '')
                    throw new Error('summary 必填');
                const outcome = reportTaskResult(a.task_id, { status: a.status, summary: a.summary });
                if (!outcome.ok)
                    throw new Error(outcome.error ?? '上报失败');
                return { ok: true };
            },
        });
    }
    catch (e) {
        try {
            console.warn('[dsh-task-board] task_report 工具注册失败（跳过）:', e instanceof Error ? e.message : String(e));
        }
        catch { /* 忽略 */ }
    }
}
