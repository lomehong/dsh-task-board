/**
 * dsh-task-board 插件入口（宿主端）。
 *
 * 挂载：cordis 插件，inject typertGateway（0.1.2 系会话网关）。
 * 职责：
 * - 组装 TaskBoardService（runner + 账本裁决 + cron tick）
 * - 注册 HTTP 路由（GET state / POST action；sameOrigin 防护与套件其他插件一致）
 * - 注入系统提示词公告（announceToAgent 开关，默认关）
 *
 * 不做的事：
 * - 不改宿主会话模型（任务→会话绑定用「执行时创建+重命名」承载，观察期后再谈深化）
 */
import type { Context } from '@deepseek-ai/cordis'
import { createService, TaskBoardService } from './service.ts'
import type { TypertGateway } from './gateway.ts'

export const inject = ['typertGateway']

interface WebRouteRegisterer {
  register(route: { kind: 'exact'; path: string; handler: (req: unknown, res: unknown) => void | Promise<void> }): () => void
}

function sameOrigin(req: { headers?: Record<string, string | string[] | undefined>; method?: string }): boolean {
  const origin = req.headers?.origin
  if (origin === undefined) return true // 同源 fetch/无 Origin（curl）放行——与套件既有路由一致
  const host = req.headers?.host
  if (typeof host !== 'string') return false
  try { return new URL(String(origin)).host === host } catch { return false }
}

function readBody(req: { on: (ev: string, cb: (c: Buffer) => void) => void; resume: () => void; destroy: () => void }): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > 128 * 1024) { req.destroy(); reject(new Error('请求体超限')); return }
      chunks.push(c)
    })
    req.on('end', () => resolve(chunks.map(c => c.toString('utf8')).join('')))
    req.resume()
  })
}

function respondJson(res: { writeHead: (s: number, h: Record<string, string>) => void; end: (b: string) => void }, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

export function apply(ctx: Context & { typertGateway: TypertGateway; webServer?: WebRouteRegisterer; logger?: { info?: (m: string) => void; warn?: (m: string) => void }; collect?: (disposer: () => void) => void }): void {
  const log = (m: string) => ctx.logger?.info?.(`[dsh-task-board] ${m}`)
  const warn = (m: string) => ctx.logger?.warn?.(`[dsh-task-board] ${m}`)

  const service = createService(ctx.typertGateway)
  const stop = service.start()
  log('任务看板服务已启动（cron tick + 运行中执行结算）')

  ctx.collect?.(stop)

  if (ctx.webServer !== undefined) {
    const web = ctx.webServer
    // GET /dsh-task-board/state：完整快照（浏览器异步视图）
    web.register({
      kind: 'exact', path: '/dsh-task-board/state',
      handler: (_req: unknown, res: unknown) => respondJson(res as { writeHead: (s: number, h: Record<string, string>) => void; end: (b: string) => void }, 200, { ok: true, state: service.state() }),
    })
    // POST /dsh-task-board/action：统一动作入口（create/update/archive/delete/run）
    web.register({
      kind: 'exact', path: '/dsh-task-board/action',
      handler: async (req: unknown, res: unknown) => {
        const r = req as { method?: string; headers: Record<string, string | string[] | undefined>; on: (ev: string, cb: (c: Buffer) => void) => void; resume: () => void; destroy: () => void }
        const resLike = res as { writeHead: (s: number, h: Record<string, string>) => void; end: (b: string) => void }
        if (r.method !== 'POST' || !sameOrigin(r)) { respondJson(resLike, 403, { ok: false, error: 'denied' }); return }
        try {
          const body = JSON.parse((await readBody(r)) || '{}') as { type?: string; id?: string; task?: Record<string, unknown> }
          switch (body.type) {
            case 'create': {
              const t = body.task ?? {}
              respondJson(resLike, 200, { ok: true, task: service.create({
                title: t.title, prompt: t.prompt, actionType: t.actionType, targetScope: t.targetScope,
                ...(t.actionLevel !== undefined ? { actionLevel: t.actionLevel } : {}),
                ...(t.cron !== undefined ? { cron: t.cron } : {}),
                ...(t.workspaceId !== undefined ? { workspaceId: t.workspaceId } : {}),
              }) })
              return
            }
            case 'update': respondJson(resLike, 200, { ok: true, task: service.update(String(body.id ?? ''), body.task ?? {}) }); return
            case 'archive': respondJson(resLike, 200, { ok: true, task: service.archive(String(body.id ?? ''), body.task?.archived === true) }); return
            case 'delete': respondJson(resLike, 200, { ok: true, removed: service.remove(String(body.id ?? '')) }); return
            case 'run': {
              const run = await service.run(String(body.id ?? ''), '手动')
              respondJson(resLike, 200, { ok: true, run })
              return
            }
            default: respondJson(resLike, 400, { ok: false, error: `未知动作类型: ${String(body.type)}` })
          }
        } catch (e) {
          respondJson(resLike, 400, { ok: false, error: e instanceof Error ? e.message : String(e) })
        }
      },
    })
    log('HTTP 路由已注册（/dsh-task-board/*）')
  } else {
    warn('webServer 缺席：看板 HTTP 路由未注册（仅 cron 调度可用）')
  }
  void TaskBoardService
}
