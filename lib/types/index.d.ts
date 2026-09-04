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
import type { Context } from '@deepseek-ai/cordis';
import type { TypertGateway } from './gateway.ts';
export declare const inject: string[];
interface WebRouteRegisterer {
    register(route: {
        kind: 'exact';
        path: string;
        handler: (req: unknown, res: unknown) => void | Promise<void>;
    }): () => void;
}
export declare function apply(ctx: Context & {
    typertGateway: TypertGateway;
    webServer?: WebRouteRegisterer;
    logger?: {
        info?: (m: string) => void;
        warn?: (m: string) => void;
    };
    collect?: (disposer: () => void) => void;
}): void;
export {};
