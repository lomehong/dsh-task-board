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
let ledgerGetter = () => undefined;
let notifierGetter;
/**
 * 注入套件账本的惰性获取器。
 *
 * 为什么不 import 包名：套件插件各自独立仓库/独立 node_modules，跨包 import
 * 在 link: 安装下不可靠（宪章 §1 原则一）。账本由 cordis 同进程服务解析获得
 * ——dsh-ledger provide('dsh-ledger')，task-board 在 index.ts 里惰性 ctx.get。
 * getter 返回 undefined 视为账本缺席 → 本地降级策略（adjudicateLocal）。
 */
export function injectLedgerGetter(getter) {
    ledgerGetter = getter;
}
/**
 * 注入主任通知器（可选增强）：本地降级模式下 L2 动作尽力经此通知主任。
 * 通常由插件入口接 im-channel（botsStatus 找主人绑定 + pushToUser）；
 * 返回 undefined 表示通知通道不可用——通知失败绝不阻断执行。
 */
export function injectNotifier(getter) {
    notifierGetter = getter;
}
/** 账本是否在场（客户端治理徽标与创建期预裁决的探测口）。 */
export function ledgerAvailable() {
    return ledgerGetter() !== undefined;
}
function ledger() {
    const mod = ledgerGetter();
    if (mod === undefined) {
        throw new Error('账本缺席：任务执行需要 dsh-ledger（套件组件），请安装 @dsh-extra/dsh-ledger');
    }
    return mod;
}
/**
 * 本地降级策略（账本缺席时的最小内嵌治理）：
 * - L3 拒绝（保守侧：不可逆动作宁拒不滥）
 * - L2 放行 + 尽力通知主任
 * - L0/L1 放行
 * 所有本地裁决都带降级原因，由 service 写入 RunRecord.summary 供主任审阅。
 */
function adjudicateLocal(input) {
    if (input.actionLevel === 'L3') {
        return {
            allowed: false, decision: '已拒绝', level: 'L3', mode: '本地',
            reason: '无账本治理：L3 不可逆动作在治理缺席时一律拒绝（安装 @dsh-extra/dsh-ledger 以启用审批流）',
        };
    }
    if (input.actionLevel === 'L2') {
        // 宪章 §3.2：治理缺席不得扩大权限面。L2 有账本时需审批，缺席同样不放行——
        // 尽力通知主任（降级可感知），任务保留待办列，装回账本后即可走审批流。
        const notify = notifierGetter?.();
        if (notify !== undefined) {
            void Promise.resolve(notify({
                title: '任务看板 · 无账本治理',
                message: `任务 ${input.taskId}（${input.actionType} → ${input.targetScope}）为 L2 动作，账本缺席已被拦截：未经审批不执行。`,
            })).catch(() => { });
        }
        return {
            allowed: false, decision: '已拒绝', level: 'L2', mode: '本地',
            reason: '无账本治理：L2 动作需要审批，已被拦截（宪章 §3.2 不扩权）——安装 @dsh-extra/dsh-ledger 后可走审批流',
        };
    }
    return {
        allowed: true, decision: '放行', level: input.actionLevel, mode: '本地',
        reason: '无账本治理：降级运行（安装 @dsh-extra/dsh-ledger 启用 L0-L3 审批治理）',
    };
}
/** 执行前裁决：账本在场走完整裁决；缺席走本地降级策略。放行才允许 launch。 */
export function adjudicate(input) {
    if (!ledgerAvailable())
        return adjudicateLocal(input);
    const result = ledger().check({
        actionType: input.actionType,
        targetScope: input.targetScope,
        levelHint: input.actionLevel,
        // 安全审计 H1：digest 携带 prompt 摘要进账本审计（全级别留痕）
        ...(input.digest !== undefined && input.digest !== '' ? { digest: input.digest } : { digest: `任务看板任务 ${input.taskId}` }),
    });
    const decision = result.judgment.decision;
    if (decision === '放行') {
        return { allowed: true, decision: '放行', level: result.judgment.level, mode: '账本', recordId: result.record.id };
    }
    if (decision === '阻断') {
        return {
            allowed: false, decision: '阻断', level: result.judgment.level, mode: '账本',
            recordId: result.record.id,
            ...(result.approval?.id !== undefined ? { approvalId: result.approval.id } : {}),
            reason: '动作级别需要主人批准——审批令牌已生成（今日待办可见），批准后重新执行即可放行',
        };
    }
    return { allowed: false, decision: '已拒绝', level: result.judgment.level, mode: '账本', recordId: result.record.id, reason: '账本裁决拒绝该动作' };
}
/** 执行结束后回填账本（结果留痕闭环；失败静默——回填不阻断看板状态流转）。 */
export function fillResult(recordId, summary) {
    let mod;
    try {
        mod = ledger();
    }
    catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    try {
        return mod.fillResult(recordId, { summary });
    }
    catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
}
