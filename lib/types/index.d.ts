/**
 * dsh-task-board 插件入口（宿主端）。
 *
 * 挂载：cordis 插件，inject typertGateway（0.1.2 系会话网关）。
 * 模式与 dsh-twin 完全一致：
 * - webServer 用 ctx.inject 延迟注入（cordis 严格：直接 ctx.webServer 访问会报
 *   "Cannot get property webServer without inject"）
 * - 路由注册返回的 disposer 用 web.effect(fn) 集中收集（fn 返回卸载函数）
 * - 日志走 ctx.logger（cordis 开放服务，免声明）
 */
import type { Context } from '@deepseek-ai/cordis';
import type { TypertGateway } from './gateway.ts';
export declare const inject: string[];
export declare function apply(ctx: Context & {
    typertGateway: TypertGateway;
    logger?: {
        info?: (m: string) => void;
        warn?: (m: string) => void;
    };
}): void;
