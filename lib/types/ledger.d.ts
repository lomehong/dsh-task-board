export type TaskColumn = '待规划' | '待办' | '进行中' | '已完成' | '已失败';
export type RunStatus = '运行中' | '成功' | '失败' | '已取消' | '待审批' | '已阻断';
export interface RunRecord {
    id: string;
    startedAt: string;
    finishedAt?: string;
    /** 执行会话 id（创建失败时缺省） */
    sessionId?: string;
    status: RunStatus;
    /** 结果摘要（回填自账本执行结论） */
    summary?: string;
    /** 账本裁决记录 id（执行结果回填到该记录） */
    ledgerRecordId?: string;
    /** 触发方式 */
    trigger: '手动' | '定时';
}
export interface TaskRecord {
    id: string;
    title: string;
    /** 执行时投递给分身会话的任务提示词 */
    prompt: string;
    column: TaskColumn;
    createdAt: string;
    updatedAt: string;
    /** 归档任务只读（仅可恢复/删除/查看），不可执行不可调度 */
    archived?: boolean;
    /** 工作区 id（缺省用宿主默认工作区） */
    workspaceId?: string;
    /** 动作声明（账本裁决输入）：本任务的意图类型与目标范围 */
    actionType: string;
    targetScope: string;
    /** 动作级别缺省 L1（需要主人圈定范围；L2/L3 意味着更高风险由主人显式调高） */
    actionLevel: 'L0' | 'L1' | 'L2' | 'L3';
    /** 5 字段 cron（分 时 日 月 周）；缺省仅手动执行 */
    cron?: string;
    /** 上次触发的分钟键（同分钟去重防重） */
    lastMinuteKey?: string;
    lastRunAt?: string;
    lastSessionId?: string;
    lastStatus?: RunStatus;
    runs: RunRecord[];
}
export interface TaskBoardStore {
    schemaVersion: 1;
    revision: number;
    tasks: TaskRecord[];
}
export declare const MAX_RUNS_PER_TASK = 20;
export declare function loadBoard(): TaskBoardStore;
export declare function saveBoard(store: TaskBoardStore): void;
/**
 * 读改写事务。同步实现即天然串行：所有写操作都是同步 fs（无 await 交错点），
 * 单线程内不可能交错；transacting 标记防重入（将来出现异步需求时先拆掉它）。
 * 校验异常在回调里同步抛出，调用方（路由层）能直接捕获转 HTTP 错误。
 */
export declare function transact<T>(fn: (store: TaskBoardStore) => T): T;
export declare function genId(prefix: string): string;
export interface CreateTaskInput {
    title: unknown;
    prompt: unknown;
    actionType: unknown;
    targetScope: unknown;
    actionLevel?: unknown;
    cron?: unknown;
    workspaceId?: unknown;
}
export declare function createTask(input: CreateTaskInput): TaskRecord;
export declare function updateTask(id: string, patch: Partial<CreateTaskInput> & {
    column?: unknown;
}): TaskRecord | undefined;
export declare function setArchived(id: string, archived: boolean): TaskRecord | undefined;
export declare function deleteTask(id: string): boolean;
export declare function findTask(store: TaskBoardStore, id: string): TaskRecord | undefined;
