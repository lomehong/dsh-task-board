/**
 * 治理裁决联动（决策二 + 套件宪章 v1.0 修订：治理是可选层，不是生存条件）。
 *
 * 账本在场：执行前过 dsh-ledger 裁决（同进程直接调用 ledger 的 check 纯函数——
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
 * 账本缺席（套件宪章 §1 原则二「运行独立」+ §3.5「治理自治」）：进入**本地降级
 * 策略**——核心功能（执行任务）保持可用，治理面显式降级：
 * - L0/L1：放行，RunRecord.summary 标注「无账本治理」
 * - L2：**拦截**（审计 F-02：降级不扩权，宪章 §3.2）+ 尽力通知主任；
 *   任务保留待办列，装回账本后即可走审批流
 * - L3：拒绝——不可逆动作（转账/删数据/账号操作等）在治理缺席时一律不放行，
 *   任务保留在待办列（不落已失败），安装账本后即可恢复完整治理
 * 客户端按 state().governance.mode 渲染治理徽标（账本就绪 / 本地降级）。
 */
export interface AdjudicateInput {
    taskId: string;
    actionType: string;
    targetScope: string;
    actionLevel: 'L0' | 'L1' | 'L2' | 'L3';
    /** 审计摘要（安全审计 H1：委托立项时携带 prompt 摘要进账本 digest） */
    digest?: string;
}
/** 治理模式：账本在场走完整裁决；缺席走本地降级策略 */
export type GovernanceMode = '账本' | '本地';
export interface GovernanceVerdict {
    allowed: boolean;
    decision: '放行' | '阻断' | '已拒绝';
    level: string;
    mode: GovernanceMode;
    /** 账本裁决记录 id（留痕，可回查；仅账本模式——本地模式无账本记录） */
    recordId?: string;
    /** 阻断时产生的审批令牌 id（主人批准后重试放行） */
    approvalId?: string;
    reason?: string;
}
export interface LedgerModule {
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
    /** 审批令牌放行（幂等；对话闭环 task_approve 用）。缺席 = 账本旧版本。 */
    approve?(approvalId: string, by?: {
        by?: string;
        via?: '审批卡片' | '命令' | 'web';
    }): Promise<unknown> | unknown;
    /** 待批准令牌清单（供 task_approve 按 recordId 定位令牌）。 */
    pendingApprovals?(): Array<{
        id: string;
        recordId?: string;
        state?: string;
        expiresAt?: string;
    }>;
}
export interface LedgerFillResult {
    ok: boolean;
    error?: string;
}
/** 本地降级模式的主任通知器（通常由插件入口接 im-channel 主人绑定）。 */
export interface LocalGovernanceNotifier {
    (input: {
        title: string;
        message: string;
    }): boolean | Promise<boolean>;
}
/** 当前账本模块（同包 tools.ts 的 task_approve 审批闭环用；缺席返回 undefined）。 */
export declare function currentLedger(): LedgerModule | undefined;
/**
 * 注入套件账本的惰性获取器。
 *
 * 为什么不 import 包名：套件插件各自独立仓库/独立 node_modules，跨包 import
 * 在 link: 安装下不可靠（宪章 §1 原则一）。账本由 cordis 同进程服务解析获得
 * ——dsh-ledger provide('dsh-ledger')，task-board 在 index.ts 里惰性 ctx.get。
 * getter 返回 undefined 视为账本缺席 → 本地降级策略（adjudicateLocal）。
 */
export declare function injectLedgerGetter(getter: () => LedgerModule | undefined): void;
/**
 * 注入主任通知器（可选增强）：本地降级模式下 L2 动作尽力经此通知主任。
 * 通常由插件入口接 im-channel（botsStatus 找主人绑定 + pushToUser）；
 * 返回 undefined 表示通知通道不可用——通知失败绝不阻断执行。
 */
export declare function injectNotifier(getter: () => LocalGovernanceNotifier | undefined): void;
/** 账本是否在场（客户端治理徽标与创建期预裁决的探测口）。 */
export declare function ledgerAvailable(): boolean;
/** 执行前裁决：账本在场走完整裁决；缺席走本地降级策略。放行才允许 launch。 */
export declare function adjudicate(input: AdjudicateInput): GovernanceVerdict;
/** 执行结束后回填账本（结果留痕闭环；失败静默——回填不阻断看板状态流转）。 */
export declare function fillResult(recordId: string, summary: string): LedgerFillResult;
