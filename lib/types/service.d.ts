/**
 * 任务看板服务组装：状态快照 + 动作分发 + tick 循环。
 *
 * 执行状态机（治理模式由账本在场与否决定，见 governance.ts）：
 *   run(task) → 治理裁决
 *     ├─ 账本阻断 → RunRecord「待审批」+ 审批令牌（今日待办可见）→ 主人批准后重试 run 放行
 *     ├─ 拒绝 → RunRecord「已阻断」
 *     ├─ 账本缺席本地降级 → L0/L1/L2 放行（summary 标注「无账本治理」）、L3 拒绝（任务保留待办列）
 *     └─ 放行 → launch 创建分身会话 → RunRecord「运行中」
 *   tick → 对运行中的 RunRecord 做 inspect：
 *     ├─ succeeded → RunRecord「成功」+ 回填账本 + 任务列「已完成」
 *     ├─ failed    → RunRecord「失败」+ 回填账本 + 任务列「已失败」
 *     └─ cancelled → RunRecord「已取消」+ 任务列「已失败」
 */
import type { TypertGateway } from './gateway.ts';
import { createTask, updateTask } from './ledger.ts';
import type { TaskRecord, RunRecord, TaskBoardStore } from './ledger.ts';
export interface ServiceOptions {
    /** 默认工作区（任务未钉扎 workspaceId 时使用） */
    defaultWorkspaceId?: string;
    /** tick 间隔毫秒（缺省 15s；测试可调小） */
    tickIntervalMs?: number;
    /** 投递失败时的自动重试次数（缺省 0 = 不重试；仅重试 launch 传输失败，不重试任务内容失败） */
    launchRetries?: number;
    /** 重试间隔基数毫秒（缺省 500ms，按次数线性退避） */
    retryBackoffMs?: number;
}
/** 活动视图（主任拍板：看板 = 唯一活动权威）。dsh-twin 活动区段按此结构消费。 */
export interface BoardActivity {
    at: string;
    /** 进行中任务的执行现场 */
    runningTasks: Array<{
        taskId: string;
        title: string;
        sessionId?: string;
    }>;
    /** 运行中且无任务归属的会话（自由会话） */
    freeSessions: Array<{
        sessionId: string;
        title?: string;
    }>;
    /** 自由会话里进行中的自主目标（goal 折叠，objective 截断 40 字，封顶 3） */
    goals: Array<{
        sessionId: string;
        title?: string;
        objective: string;
        roundsStarted: number;
        maxGoalRounds: number;
    }>;
    /** 待主任审批的任务 */
    pendingApprovals: Array<{
        taskId: string;
        title: string;
    }>;
    /** 最近完成的任务（含结果摘要，按时间倒序，封顶 5） */
    recentCompleted: Array<{
        taskId: string;
        title: string;
        status: string;
        finishedAt?: string;
        summary?: string;
    }>;
}
export declare class TaskBoardService {
    private readonly runner;
    private readonly gatewayClient;
    logger?: {
        info?: (m: string) => void;
        warn?: (m: string) => void;
    };
    private tickTimer?;
    private readonly tickIntervalMs;
    private readonly defaultWorkspaceId;
    private readonly launchRetries;
    private readonly retryBackoffMs;
    private ticking;
    private activity;
    constructor(gateway: TypertGateway, options?: ServiceOptions);
    /** 宿主接线后启动 tick 循环；返回停止函数。 */
    start(): () => void;
    /**
     * 活动视图（主任拍板：看板 = 唯一活动权威）。
     * tick 周期刷新缓存；此处同步返回缓存——消费方（dsh-twin 活动区段）
     * 在 systemPrompt 组装时同步读取，绝无网络等待。
     */
    activityView(): BoardActivity;
    /**
     * 刷新活动视图：进行中任务的执行现场、待审批、最近完成、自由会话
     * （运行中且未归属任何任务的会话——经宿主 session/list 观察）。
     * 会话维度失败只降级该维度，不影响任务维度。公有：测试与宿主可直接触发。
     */
    refreshActivity(): Promise<void>;
    /** 状态快照（浏览器异步视图的完整数据面）。governance.mode 供客户端渲染治理徽标。 */
    state(): TaskBoardStore & {
        scheduler: {
            lastTickAt?: string;
        };
        governance: {
            mode: '账本' | '本地';
        };
    };
    private lastTickAt?;
    /** 创建任务并按声明的动作级别做**预裁决**：L2 及以上立即产生审批令牌（不等首次执行）。账本缺席时不预裁决——由本地降级策略在执行时处理。 */
    createWithGovernance(input: Parameters<typeof createTask>[0]): Promise<TaskRecord>;
    /** 执行任务：账本裁决 → 放行则投递分身会话。返回执行记录（含审批令牌时为待审批）。 */
    run(taskId: string, trigger: '手动' | '定时'): Promise<RunRecord>;
    /** tick：调度触发 + 运行中执行的结果判定。 */
    tick(): Promise<void>;
    private taskOf;
    private recordRun;
    create(input: Parameters<typeof createTask>[0]): Promise<TaskRecord>;
    update(id: string, patch: Parameters<typeof updateTask>[1]): TaskRecord | undefined;
    archive(id: string, archived: boolean): TaskRecord | undefined;
    remove(id: string): boolean;
}
/** 供路由层构造（每个宿主进程一个服务实例）。 */
export declare function createService(gateway: TypertGateway, options?: ServiceOptions): TaskBoardService;
export type { TaskRecord, RunRecord, TaskBoardStore };
