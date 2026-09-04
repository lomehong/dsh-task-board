/**
 * 账本裁决联动（决策二：账本是一等公民）。
 *
 * 任务执行前过 dsh-ledger 裁决（同进程直接调用 ledger 的 check 纯函数——
 * cordis 全部插件同进程，Node 单线程内同步调用天然串行，与 HTTP 形态的
 * 裁决共享同一份 ledger.json 单写者存储，无并发交错）。
 *
 * 裁决语义（L0-L3，见 dsh-ledger）：
 * - 放行：任务进入执行队列
 * - 阻断：产生审批令牌（approval.id）→ 今日待办「待批审批」→ 主人批准发授权
 *   → 授权在位时同一任务重试裁决即放行（grantCovers 命中）
 * - 已拒绝：终态，任务回失败列
 *
 * 结果回填：执行结束后 fillResult 把结果摘要写回账本记录（账本留痕闭环）。
 *
 * 依赖探测：@dsh-extra/dsh-ledger 缺席时**拒绝执行**（fail-closed）——
 * 账本是治理前提，不是可选项；错误信息明确指引安装套件账本。
 */
export interface AdjudicateInput {
    taskId: string;
    actionType: string;
    targetScope: string;
    actionLevel: 'L0' | 'L1' | 'L2' | 'L3';
}
export interface GovernanceVerdict {
    allowed: boolean;
    decision: '放行' | '阻断' | '已拒绝';
    level: string;
    /** 账本裁决记录 id（留痕，可回查） */
    recordId: string;
    /** 阻断时产生的审批令牌 id（主人批准后重试放行） */
    approvalId?: string;
    reason?: string;
}
export interface LedgerFillResult {
    ok: boolean;
    error?: string;
}
interface LedgerModule {
    check(input: {
        actionType: unknown;
        targetScope: unknown;
        levelHint?: unknown;
        digest?: unknown;
    }): {
        record: {
            id: string;
            status: string;
        };
        judgment: {
            decision: string;
            level: string;
        };
        approval?: {
            id: string;
        };
    };
    fillResult(recordId: string, input: {
        summary?: unknown;
        masterFeedback?: unknown;
    }): {
        ok: boolean;
        error?: string;
    };
}
/**
 * 注入套件账本。为什么不 import 包名：套件插件各自独立仓库/独立 node_modules，
 * 跨包 import 在 link: 安装下依赖宿主的包提升，不可靠。宿主（cordis 同进程）
 * 在 apply 时把已加载的 dsh-ledger 模块对象注入进来；注入缺省视为账本缺席
 * （fail-closed：执行被拒绝并给出明确指引）。
 */
export declare function injectLedger(mod: LedgerModule | undefined): void;
/** 执行前裁决：放行才允许 launch；阻断时把审批令牌带回给调用方（进今日待办）。 */
export declare function adjudicate(input: AdjudicateInput): GovernanceVerdict;
/** 执行结束后回填账本（结果留痕闭环；失败静默——回填不阻断看板状态流转）。 */
export declare function fillResult(recordId: string, summary: string): LedgerFillResult;
export {};
