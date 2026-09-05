/**
 * 任务结算的记忆沉淀（决策五「记忆是经验积累」的落地）。
 *
 * 任务落定终态时，把结果摘要写入 dsh-memory 共享记忆库——
 * 陈述类型「已验证结果」+ 验证三元组（看板结算即验证：分身上报或会话 turn-end
 * 均为已发生的客观事实，不是候选猜测）。写入后，主任在任何会话问
 * 「最近完成了哪些工作」，tool-memory / 按回合装配都能检索到。
 *
 * 跨插件契约（宪章 §1）：dsh-memory 是**可选增强**，经惰性解析接入
 * （与 dsh-ledger 的 injectLedgerGetter 同一形态）。缺席或写入失败只
 * WARN 一次，绝不影响看板终态——治理与沉淀都是增强，不是生存条件。
 *
 * @module dsh-task-board/memory
 */
/** dsh-memory 服务的最小结构视图（与 dsh-twin 的 MemoryServiceLike 同宽度）。 */
export interface TaskMemoryModule {
    addMemoryEntry?(entry: {
        content: string;
        type: string;
        scope: string;
        author: string;
        authorRole: string;
        statementType?: string;
        source?: {
            origin: string;
            ref?: string;
        };
        verify?: {
            status: string;
            method?: string;
            at?: string;
        };
    }): Promise<unknown> | unknown;
}
/**
 * 注入 dsh-memory 的惰性获取器（插件 apply 时由 index.ts 接线）。
 * getter 返回 undefined 视为缺席 → 记忆沉淀显式降级。
 */
export declare function injectMemoryGetter(getter: () => TaskMemoryModule | undefined): void;
/**
 * 任务落定 → 记忆沉淀（尽力而为，fire-and-forget）。
 *
 * 成功与失败都写：失败同样是"已验证的结果"（对主任有用的经验）。
 * 内容自包含（任务号 + 标题 + 摘要），保证脱离上下文仍可被检索理解。
 *
 * @param task   任务标识（id + title）
 * @param status 终态（成功 / 失败）
 * @param summary 结果摘要（分身上报或宿主结算模板句）
 */
export declare function recordTaskOutcome(task: {
    id: string;
    title: string;
}, status: '成功' | '失败', summary: string): Promise<void>;
