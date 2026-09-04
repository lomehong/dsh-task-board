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
import type { Context } from '@deepseek-ai/cordis';
import type { TypertGateway } from './gateway.ts';
declare function apply(ctx: Context & {
    typertGateway: TypertGateway;
    logger?: {
        info?: (m: string) => void;
        warn?: (m: string) => void;
    };
}): void;
declare const _default: typeof apply & {
    inject: string[];
};
export default _default;
