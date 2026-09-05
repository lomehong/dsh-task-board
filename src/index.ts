/**
 * dsh-task-board 插件入口（宿主端）。
 *
 * 挂载：cordis 插件。导出形态与 dsh-yuyi 一致用 default export——
 * cordis-plugin-loader 的 unwrapExports 优先取 .default，**命名导出 inject
 * 会在取 default 时被丢掉**，所以 inject 必须挂在 default 函数本身上
 * （Object.assign(apply, { inject })），否则 cordis 报
 * "Cannot get property typertGateway without inject"。
 *
 * 其余模式与 dsh-twin 完全一致：
 * - webServer 用 ctx.inject 延迟注入（cordis 严格：直接 ctx.webServer 访问会报
 *   "Cannot get property webServer without inject"）
 * - 路由注册返回的 disposer 用 web.effect(fn) 集中（fn 返回卸载函数）
 * - 日志走 ctx.logger（cordis 开放服务，免声明）
 */
import type { Context } from '@deepseek-ai/cordis'
import { createService } from './service.ts'
import { injectLedgerGetter, injectNotifier, type LedgerModule } from './governance.ts'
import type { TypertGateway } from './gateway.ts'

interface RequestLike {
  method?: string
  headers?: Record<string, string | string[] | undefined>
  on: (ev: string, cb: (c: Buffer) => void) => void
  resume: () => void
  destroy: () => void
}
interface ResponseLike {
  writeHead(status: number, headers: Record<string, string>): void
  end(body: string): void
}
interface WebServerLike {
  register(route: { kind: 'exact'; path: string; handler: (req: RequestLike, res: ResponseLike) => void | Promise<void> }): () => void
  effect?(fn: () => () => void): void
}

function sameOrigin(req: RequestLike): boolean {
  const origin = req.headers?.origin
  if (origin === undefined) return true
  const host = req.headers?.host
  if (typeof host !== 'string') return false
  try { return new URL(String(origin)).host === host } catch { return false }
}

function readBody(req: RequestLike): Promise<string> {
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

function respondJson(res: ResponseLike, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

function handleAction(service: ReturnType<typeof createService>, req: RequestLike, res: ResponseLike): Promise<void> {
  return (async (): Promise<void> => {
    if (req.method !== 'POST' || !sameOrigin(req)) { respondJson(res, 403, { ok: false, error: 'denied' }); return }
    try {
      const body = JSON.parse((await readBody(req)) || '{}') as { type?: string; id?: string; task?: Record<string, unknown> }
      switch (body.type) {
        case 'create': {
          const t = body.task ?? {}
          const task = service.create({
            title: t.title, prompt: t.prompt, actionType: t.actionType, targetScope: t.targetScope,
            ...(t.actionLevel !== undefined ? { actionLevel: t.actionLevel as 'L0' | 'L1' | 'L2' | 'L3' } : {}),
            ...(t.cron !== undefined ? { cron: t.cron } : {}),
            ...(t.workspaceId !== undefined ? { workspaceId: t.workspaceId } : {}),
          })
          respondJson(res, 200, { ok: true, task }); return
        }
        case 'update': respondJson(res, 200, { ok: true, task: service.update(String(body.id ?? ''), body.task ?? {}) }); return
        case 'archive': respondJson(res, 200, { ok: true, task: service.archive(String(body.id ?? ''), body.task?.archived === true) }); return
        case 'delete': respondJson(res, 200, { ok: true, removed: service.remove(String(body.id ?? '')) }); return
        case 'run': { const run = await service.run(String(body.id ?? ''), '手动'); respondJson(res, 200, { ok: true, run }); return }
        default: respondJson(res, 400, { ok: false, error: `未知动作类型: ${String(body.type)}` })
      }
    } catch (e) { respondJson(res, 400, { ok: false, error: e instanceof Error ? e.message : String(e) }) }
  })()
}

function apply(ctx: Context & { typertGateway: TypertGateway; logger?: { info?: (m: string) => void; warn?: (m: string) => void } }): void {
  const log = (m: string) => ctx.logger?.info?.(`[dsh-task-board] ${m}`)
  const warn = (m: string) => ctx.logger?.warn?.(`[dsh-task-board] ${m}`)

  // 账本惰性解析：dsh-ledger provide('dsh-ledger')，与本插件加载顺序无关
  // （ctx.get 是 cordis 官方豁免注入声明的可选服务读取口，与 dsh-twin 同模式）
  injectLedgerGetter(() => {
    try {
      return (ctx as unknown as { get(name: string): unknown }).get('dsh-ledger') as LedgerModule | undefined
    } catch {
      return undefined
    }
  })

  // 主任通知器（可选增强，宪章 §3.2）：无账本治理模式下 L2 动作降级运行时，
  // 尽力经 im-channel 主人绑定推送告知。im-channel 缺席/未绑定主人/推送失败
  // 一律静默跳过——通知是缓解措施，不是闸门（宪章 §3.2 降级第二要素）。
  injectNotifier(() => {
    try {
      const im = (ctx as unknown as { get(name: string): unknown }).get('im-channel') as
        | {
          botsStatus(): Array<{ kind: string; bindings?: Array<{ isMaster?: boolean; userId?: string }> }>
          pushToUser(kind: string, userId: string, text: string, opts?: { markdown?: boolean }): Promise<boolean> | boolean
        }
        | undefined
      if (im === undefined || typeof im.botsStatus !== 'function' || typeof im.pushToUser !== 'function') return undefined
      return async ({ title, message }) => {
        const seen = new Set<string>()
        const targets: Array<{ kind: string; userId: string }> = []
        for (const bot of im.botsStatus()) {
          for (const b of bot.bindings ?? []) {
            if (b.isMaster === true && b.userId !== undefined && !seen.has(b.userId)) {
              seen.add(b.userId)
              targets.push({ kind: bot.kind, userId: b.userId })
            }
          }
        }
        // 跨渠道去重后上限 3（与 dsh-twin 转人工同一预算哲学：保护主任注意力）
        let delivered = 0
        for (const t of targets.slice(0, 3)) {
          try {
            if (await im.pushToUser(t.kind, t.userId, `【${title}】${message}`, { markdown: true })) delivered += 1
          } catch { /* 单目标失败不阻断其余目标 */ }
        }
        return delivered > 0
      }
    } catch {
      return undefined
    }
  })

  // 1) service 立即组装 + 启动 cron tick（typertGateway 已通过 default 函数上的 inject 声明）
  const service = createService(ctx.typertGateway)
  service.logger = ctx.logger
  const stop = service.start()
  log('任务看板服务已启动（cron tick + 运行中执行结算）')

  // 2) webServer 是延迟注入（与 dsh-twin 一致）：用 ctx.inject 拿 webServer，路由
  //    注册的 disposer 通过 web.effect(fn) 集中（fn 返回统一卸载函数）
  ctx.inject(['webServer'], (wctx: unknown) => {
    const web = (wctx as { get(name: string): unknown }).get('webServer') as WebServerLike | undefined
    if (web === undefined || typeof web.register !== 'function') {
      warn('webServer 缺席：看板 HTTP 路由未注册（仅 cron 调度可用）')
      return
    }
    if (typeof web.effect === 'function') {
      web.effect(() => {
        const disposers: Array<() => void> = []
        disposers.push(web.register({
          kind: 'exact', path: '/dsh-task-board/state',
          handler: (_req, res) => respondJson(res, 200, { ok: true, state: service.state() }),
        }))
        disposers.push(web.register({
          kind: 'exact', path: '/dsh-task-board/action',
          handler: (req, res) => { void handleAction(service, req, res) },
        }))
        log('HTTP 路由已注册（/dsh-task-board/*）')
        return () => { for (const d of disposers) d(); stop() }
      })
    } else {
      web.register({ kind: 'exact', path: '/dsh-task-board/state', handler: (_req, res) => respondJson(res, 200, { ok: true, state: service.state() }) })
      web.register({ kind: 'exact', path: '/dsh-task-board/action', handler: (req, res) => { void handleAction(service, req, res) } })
      log('HTTP 路由已注册（/dsh-task-board/*；宿主无 effect API）')
    }
  })
}

export default Object.assign(apply, { inject: ['typertGateway'] })
