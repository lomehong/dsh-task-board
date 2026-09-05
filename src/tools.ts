/**
 * 任务看板的模型工具入口：preset 行（`name: '@dsh-extra/dsh-task-board/tools'`）
 * 引用本模块，挂载后的分身会话获得 task_report 工具——把执行结果结构化回填
 * 看板（状态 + 给主任看的摘要），替代宿主侧 turn/end 推断与模板句回填
 * （套件宪章第二阶段「任务层间挂链」）。
 *
 * 注册形态：鸭子类型 tools.register（对齐 dsh-computer/tools），不引入
 * dsh-tools 运行时依赖；看板存储经同包 ledger.ts 单写者事务访问。
 * 注册失败降级为跳过：绝不让工具注册问题炸掉会话创建。
 *
 * @module @dsh-extra/dsh-task-board/tools
 */
import type { Context } from '@deepseek-ai/cordis'
import { reportTaskResult, type ReportStatus } from './report.ts'

interface JsonSchemaLike {
  type: 'object'
  additionalProperties?: boolean
  required?: string[]
  properties: Record<string, unknown>
}

interface ToolOutputLike {
  schema: JsonSchemaLike
  render: (args: unknown, value: unknown) => Array<{ type: 'text'; text: string }>
}

interface ToolRegistration {
  name: string
  description: string
  parameters: JsonSchemaLike
  output: ToolOutputLike
  execute: (args: unknown, exec: unknown) => Promise<unknown>
}

interface ToolsLike {
  register(tool: ToolRegistration): void
}

export const name = 'tool-task-board'
export const inject = ['tools']

export function apply(ctx: Context): void {
  const host = ctx as unknown as { tools?: ToolsLike; get?(name: string): unknown }
  const tools = host.tools ?? (host.get?.('tools') as ToolsLike | undefined)
  if (tools === undefined || typeof tools.register !== 'function') return
  try {
    tools.register({
      name: 'task_report',
      description:
        '上报当前看板任务的执行结果（状态 + 给主任看的摘要）。看板投递的任务提示词中带有任务号；' +
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
          const v = value as { ok?: boolean; error?: string }
          if (v.ok !== true) return [{ type: 'text', text: `上报失败：${v.error ?? '未知原因'}` }]
          return [{ type: 'text', text: '结果已上报任务看板，主任可在看板中查看。' }]
        },
      },
      execute: async (args, exec) => {
        const a = (args ?? {}) as { task_id?: string; status?: string; summary?: string }
        if (typeof a.task_id !== 'string' || a.task_id === '') throw new Error('task_id 必填')
        if (a.status !== '成功' && a.status !== '失败') throw new Error('status 必须是 成功 或 失败')
        if (typeof a.summary !== 'string' || a.summary.trim() === '') throw new Error('summary 必填')
        // F-03 防伪造：以当前执行会话 id 与运行记录比对（exec 由宿主注入，不可伪造）
        const sessionId = String((exec as { agent?: { id?: unknown } } | undefined)?.agent?.id ?? '')
        const outcome = reportTaskResult(a.task_id, { status: a.status as ReportStatus, summary: a.summary, sessionId })
        if (!outcome.ok) throw new Error(outcome.error ?? '上报失败')
        return { ok: true }
      },
    })
  } catch (e) {
    try { console.warn('[dsh-task-board] task_report 工具注册失败（跳过）:', e instanceof Error ? e.message : String(e)) } catch { /* 忽略 */ }
  }
}
