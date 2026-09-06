import { createService } from './service.js';
import { confirmTaskResult } from './report.js';
import { injectLedgerGetter, injectNotifier } from './governance.js';
import { injectMemoryGetter } from './memory.js';
import { injectServiceGetter } from './tools.js';
function sameOrigin(req) {
    const origin = req.headers?.origin;
    if (origin === undefined)
        return true;
    const host = req.headers?.host;
    if (typeof host !== 'string')
        return false;
    try {
        return new URL(String(origin)).host === host;
    }
    catch {
        return false;
    }
}
function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', (c) => {
            size += c.length;
            if (size > 128 * 1024) {
                req.destroy();
                reject(new Error('请求体超限'));
                return;
            }
            chunks.push(c);
        });
        req.on('end', () => resolve(chunks.map(c => c.toString('utf8')).join('')));
        req.resume();
    });
}
function respondJson(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
}
function handleAction(service, confirmTask, req, res) {
    return (async () => {
        if (req.method !== 'POST' || !sameOrigin(req)) {
            respondJson(res, 403, { ok: false, error: 'denied' });
            return;
        }
        try {
            const body = JSON.parse((await readBody(req)) || '{}');
            switch (body.type) {
                case 'create': {
                    const t = body.task ?? {};
                    const task = service.create({
                        title: t.title, prompt: t.prompt, actionType: t.actionType, targetScope: t.targetScope,
                        ...(t.actionLevel !== undefined ? { actionLevel: t.actionLevel } : {}),
                        ...(t.cron !== undefined ? { cron: t.cron } : {}),
                        ...(t.workspaceId !== undefined ? { workspaceId: t.workspaceId } : {}),
                    });
                    respondJson(res, 200, { ok: true, task });
                    return;
                }
                case 'update':
                    respondJson(res, 200, { ok: true, task: service.update(String(body.id ?? ''), body.task ?? {}) });
                    return;
                case 'archive':
                    respondJson(res, 200, { ok: true, task: service.archive(String(body.id ?? ''), body.task?.archived === true) });
                    return;
                case 'delete':
                    respondJson(res, 200, { ok: true, removed: service.remove(String(body.id ?? '')) });
                    return;
                case 'run': {
                    const run = await service.run(String(body.id ?? ''), '手动');
                    respondJson(res, 200, { ok: true, run });
                    return;
                }
                case 'claim': {
                    const run = service.claim(String(body.id ?? ''), String(body.sessionId ?? ''), '手动');
                    respondJson(res, 200, { ok: true, run });
                    return;
                }
                case 'confirm': {
                    const r = confirmTask(String(body.id ?? ''), body.approved !== false);
                    respondJson(res, r.ok ? 200 : 400, r);
                    return;
                }
                default: respondJson(res, 400, { ok: false, error: `未知动作类型: ${String(body.type)}` });
            }
        }
        catch (e) {
            respondJson(res, 400, { ok: false, error: e instanceof Error ? e.message : String(e) });
        }
    })();
}
function apply(ctx) {
    const log = (m) => ctx.logger?.info?.(`[dsh-task-board] ${m}`);
    const warn = (m) => ctx.logger?.warn?.(`[dsh-task-board] ${m}`);
    // 账本惰性解析：dsh-ledger provide('dsh-ledger')，与本插件加载顺序无关
    // （ctx.get 是 cordis 官方豁免注入声明的可选服务读取口，与 dsh-twin 同模式）
    injectLedgerGetter(() => {
        try {
            return ctx.get('dsh-ledger');
        }
        catch {
            return undefined;
        }
    });
    // 记忆惰性解析（可选增强，宪章 §3.2）：任务落定时把结果沉淀进 dsh-memory
    // 共享记忆（「已验证结果」），主任问「最近完成了哪些工作」即可被检索。
    // 缺席/失败由 memory.ts 显式降级（WARN 一次），不影响看板终态。
    injectMemoryGetter(() => {
        try {
            return ctx.get('dsh-memory');
        }
        catch {
            return undefined;
        }
    });
    // 主任通知器（可选增强，宪章 §3.2）：无账本治理模式下 L2 动作降级运行时，
    // 尽力经 im-channel 主人绑定推送告知。im-channel 缺席/未绑定主人/推送失败
    // 一律静默跳过——通知是缓解措施，不是闸门（宪章 §3.2 降级第二要素）。
    injectNotifier(() => {
        try {
            const im = ctx.get('im-channel');
            if (im === undefined || typeof im.botsStatus !== 'function' || typeof im.pushToUser !== 'function')
                return undefined;
            return async ({ title, message }) => {
                const seen = new Set();
                const targets = [];
                for (const bot of im.botsStatus()) {
                    for (const b of bot.bindings ?? []) {
                        if (b.isMaster === true && b.userId !== undefined && !seen.has(b.userId)) {
                            seen.add(b.userId);
                            targets.push({ kind: bot.kind, userId: b.userId });
                        }
                    }
                }
                // 跨渠道去重后上限 3（与 dsh-twin 转人工同一预算哲学：保护主任注意力）
                let delivered = 0;
                for (const t of targets.slice(0, 3)) {
                    try {
                        if (await im.pushToUser(t.kind, t.userId, `【${title}】${message}`, { markdown: true }))
                            delivered += 1;
                    }
                    catch { /* 单目标失败不阻断其余目标 */ }
                }
                return delivered > 0;
            };
        }
        catch {
            return undefined;
        }
    });
    // 1) service 立即组装 + 启动 cron tick（typertGateway 已通过 default 函数上的 inject 声明）
    const service = createService(ctx.typertGateway);
    service.logger = ctx.logger;
    const stop = service.start();
    log('任务看板服务已启动（cron tick + 运行中执行结算）');
    // 模型工具（task_delegate 对话内下单）的看板服务注入：同进程单例模块，
    // 预设行 '@dsh-extra/dsh-task-board/tools' 的 apply 在 agent 上下文执行时
    // 经此获取宿主 service（createWithGovernance 含 L2+ 预裁决）。
    injectServiceGetter(() => service);
    // 只读状态服务（宪章 §1 可选增强标准形态）：dsh-twin 活动快照经惰性
    // ctx.get('dsh-task-board') 消费，问「在忙什么」时能看到看板进行中任务。
    // 本插件不依赖消费方存在；消费方缺席也不影响本插件（原则二）。
    try {
        ctx.provide?.('dsh-task-board', {
            /** 活动视图（看板 = 唯一活动权威；缓存由 tick 每 15s 刷新，同步读取）。
             *  安全审计 M-3：故意不暴露 state()——完整状态（含主任任务 prompt 全文）
             *  只经同源 HTTP /dsh-task-board/state 供浏览器 UI，服务面收敛为最小投影。 */
            activity: () => service.activityView(),
        });
    }
    catch (e) {
        log(`状态服务提供失败（不影响看板）: ${e instanceof Error ? e.message : String(e)}`);
    }
    // 2) webServer 是延迟注入（与 dsh-twin 一致）：用 ctx.inject 拿 webServer，路由
    //    注册的 disposer 通过 web.effect(fn) 集中（fn 返回统一卸载函数）
    ctx.inject(['webServer'], (wctx) => {
        const web = wctx.get('webServer');
        if (web === undefined || typeof web.register !== 'function') {
            warn('webServer 缺席：看板 HTTP 路由未注册（仅 cron 调度可用）');
            return;
        }
        if (typeof web.effect === 'function') {
            web.effect(() => {
                const disposers = [];
                disposers.push(web.register({
                    kind: 'exact', path: '/dsh-task-board/state',
                    handler: (_req, res) => respondJson(res, 200, { ok: true, state: service.state() }),
                }));
                disposers.push(web.register({
                    kind: 'exact', path: '/dsh-task-board/action',
                    handler: (req, res) => { void handleAction(service, confirmTaskResult, req, res); },
                }));
                log('HTTP 路由已注册（/dsh-task-board/*）');
                return () => { for (const d of disposers)
                    d(); stop(); };
            });
        }
        else {
            web.register({ kind: 'exact', path: '/dsh-task-board/state', handler: (_req, res) => respondJson(res, 200, { ok: true, state: service.state() }) });
            web.register({ kind: 'exact', path: '/dsh-task-board/action', handler: (req, res) => { void handleAction(service, confirmTaskResult, req, res); } });
            log('HTTP 路由已注册（/dsh-task-board/*；宿主无 effect API）');
        }
    });
}
export default Object.assign(apply, { inject: ['typertGateway'] });
