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

/** 看板服务的最小结构视图（对话内下单用；宿主 index.ts 经 injectServiceGetter 注入）。 */
interface DelegateService {
  createWithGovernance(input: {
    title: string
    prompt: string
    actionType: string
    targetScope: string
    actionLevel: 'L0' | 'L1' | 'L2' | 'L3'
    cron?: string
  }): Promise<{ id: string; title: string }>
  run(id: string, trigger: string): Promise<{ status?: string }>
}

let serviceGetter: (() => DelegateService | undefined) | undefined

/** 注入看板服务获取器（宿主 index.ts apply 内接线；工具执行时惰性解析）。 */
export function injectServiceGetter(getter: (() => DelegateService | undefined) | undefined): void {
  serviceGetter = getter
}

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
  // ── task_delegate：对话内下单（主任拍板 #3，审计路线 P1-7）──
  try {
    tools.register({
      name: 'task_delegate',
      description:
        '把主任口头布置的工作立项为看板任务（可立即执行）。凡主任交代的多步骤、耗时、需要跟进或定时性的工作，' +
        '都应立任务而不是在对话里直接做——立项后主任可在任何通道问「在忙什么」看到进展。' +
        '自由会话里的自主目标需要转正为正式任务时，也用本工具（立项后原目标应暂停避免双跑）。' +
        'action_level 请按账本分级语义如实申报（L2 及以上未经主人批准不会执行，属正常治理流程）。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'prompt', 'action_type', 'target_scope', 'action_level'],
        properties: {
          title: { type: 'string', description: '任务标题（一句话说清要做什么）' },
          prompt: { type: 'string', description: '执行提示词：投递给执行会话的完整、自包含的工作指令' },
          action_type: { type: 'string', description: '动作类型（如 答疑/代回消息/发布内容/整理汇报）' },
          target_scope: { type: 'string', description: '目标范围（对谁/对哪个系统生效）' },
          action_level: { type: 'string', enum: ['L0', 'L1', 'L2', 'L3'], description: '动作级别：L0 答疑检索 / L1 代办通知 / L2 对外承诺发布 / L3 转账删数据（禁区）' },
          cron: { type: 'string', description: '可选，5 字段 cron 定时（分 时 日 月 周，本地时区）；缺省为手动任务' },
          run_now: { type: 'boolean', description: '是否立即执行一次（缺省 true；cron 定时任务建议 false）' },
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean' },
            task_id: { type: 'string' },
            action_level: { type: 'string', description: '实际生效的动作级别（含强制提级后）' },
            run_status: { type: 'string' },
            error: { type: 'string' },
          },
        },
        render: (_args, value) => {
          const v = value as { ok?: boolean; task_id?: string; run_status?: string; error?: string }
          if (v.ok !== true) return [{ type: 'text', text: `立项失败：${v.error ?? '未知原因'}` }]
          return [{ type: 'text', text: `已立项 ${v.task_id}（${v.run_status}）。主任可在任务看板查看进展。` }]
        },
      },
      execute: async (args, exec) => {
        const a = (args ?? {}) as Record<string, unknown>
        const title = typeof a.title === 'string' ? a.title.trim() : ''
        const prompt = typeof a.prompt === 'string' ? a.prompt.trim() : ''
        const actionType = typeof a.action_type === 'string' ? a.action_type.trim() : ''
        const targetScope = typeof a.target_scope === 'string' ? a.target_scope.trim() : ''
        const declared = a.action_level
        if (title === '') throw new Error('title 必填')
        if (prompt === '') throw new Error('prompt 必填（执行会话依赖它独立完成工作）')
        if (actionType === '') throw new Error('action_type 必填（账本分级依据）')
        if (targetScope === '') throw new Error('target_scope 必填（账本分级依据）')
        if (declared !== 'L0' && declared !== 'L1' && declared !== 'L2' && declared !== 'L3') throw new Error('action_level 必须是 L0/L1/L2/L3')
        // 安全审计 H1 加固（关键词地板 v2）：只对**明确的对外/破坏性**词提升——
        //  v1 把"删除几行 DEBUG 打印"这类代码修复措辞误伤成 L3，导致任务永远无法执行
        const surface = `${title}\n${prompt}`
        let level: 'L0' | 'L1' | 'L2' | 'L3' = declared
        if (/(转账|付款|支付|删库|清空数据|删除数据|格式化磁盘|账号操作)/.test(surface)) {
          level = 'L3'
        } else if (/(对外|公开发布|群发|发给客户|上传到公网|提交到远程仓库)/.test(surface) && (level === 'L0' || level === 'L1')) {
          level = 'L2'
        }
        // 调用方身份：必须在真实 agent 会话内调用（exec 由宿主注入，模型不可伪造）
        const caller = String((exec as { agent?: { id?: unknown } } | undefined)?.agent?.id ?? '')
        if (caller === '') throw new Error('task_delegate 必须在 agent 会话内调用（缺调用方身份）')
        const cron = typeof a.cron === 'string' && a.cron.trim() !== '' ? a.cron.trim() : undefined
        const runNow = a.run_now !== false
        const svc = serviceGetter?.()
        if (svc === undefined || typeof svc.createWithGovernance !== 'function' || typeof svc.run !== 'function') {
          throw new Error('看板服务不可用（宿主未就绪）')
        }
        const t = await svc.createWithGovernance({
          title, prompt, actionType, targetScope, actionLevel: level,
          ...(cron !== undefined ? { cron } : {}),
        })
        let runStatus = '未执行（run_now=false）'
        if (runNow) {
          try {
            const run = await svc.run(t.id, '手动')
            runStatus = String(run.status ?? '已投递')
          } catch (e) {
            runStatus = '启动失败：' + (e instanceof Error ? e.message : String(e))
          }
        }
        return { ok: true, task_id: t.id, action_level: level, run_status: runStatus }
      },
    })
  } catch (e) {
    try { console.warn('[dsh-task-board] task_delegate 工具注册失败（跳过）:', e instanceof Error ? e.message : String(e)) } catch { /* 忽略 */ }
  }
}
