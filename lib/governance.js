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
let ledgerGetter = () => undefined;
/**
 * 注入套件账本的惰性获取器。
 *
 * 为什么不 import 包名：套件插件各自独立仓库/独立 node_modules，跨包 import
 * 在 link: 安装下不可靠。账本由 cordis 同进程服务解析获得——dsh-ledger
 * provide('dsh-ledger')，task-board 在 index.ts 里惰性 ctx.get。
 * getter 返回 undefined 视为账本缺席（fail-closed：执行被拒并给出指引）。
 */
export function injectLedgerGetter(getter) {
    ledgerGetter = getter;
}
function ledger() {
    const mod = ledgerGetter();
    if (mod === undefined) {
        throw new Error('账本缺席：任务执行需要 dsh-ledger（套件组件），请安装 @dsh-extra/dsh-ledger');
    }
    return mod;
}
/** 执行前裁决：放行才允许 launch；阻断时把审批令牌带回给调用方（进今日待办）。 */
export function adjudicate(input) {
    const mod = ledger();
    const result = mod.check({
        actionType: input.actionType,
        targetScope: input.targetScope,
        levelHint: input.actionLevel,
        digest: `任务看板任务 ${input.taskId}`,
    });
    const decision = result.judgment.decision;
    if (decision === '放行') {
        return { allowed: true, decision: '放行', level: result.judgment.level, recordId: result.record.id };
    }
    if (decision === '阻断') {
        return {
            allowed: false, decision: '阻断', level: result.judgment.level,
            recordId: result.record.id,
            ...(result.approval?.id !== undefined ? { approvalId: result.approval.id } : {}),
            reason: '动作级别需要主人批准——审批令牌已生成（今日待办可见），批准后重新执行即可放行',
        };
    }
    return { allowed: false, decision: '已拒绝', level: result.judgment.level, recordId: result.record.id, reason: '账本裁决拒绝该动作' };
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
