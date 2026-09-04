/**
 * 五字段 cron 解析器（分 时 日 月 周），纯函数、零依赖。
 *
 * 支持语法：星号、步进（斜杠后跟步长，如「每 15 分钟」）、范围、逗号列表；
 * 周日 0 与 7 等价；日/周采用标准 OR 语义（两者都受限时命中任一即触发）。
 *
 * 调度模型：宿主每分钟 tick 一次，用 cronMatches(expr, now) 判定是否触发；
 * 由调用方负责同一分钟去重（记录 lastMinute 防重）。错过的时间点不补跑。
 * （注意：本文件任何块注释里不得出现「星号紧跟斜杠」的字面量——那会提前
 * 终止块注释；步进语法一律用文字描述。）
 */
export class CronError extends Error {
}
const FIELDS = {
    minute: { min: 0, max: 59 },
    hour: { min: 0, max: 23 },
    dom: { min: 1, max: 31 },
    month: { min: 1, max: 12 },
    dow: { min: 0, max: 7 },
};
/** 解析单字段表达式为命中值集合。 */
function parseField(raw, spec, name) {
    const values = new Set();
    for (const part of raw.split(',')) {
        const piece = part.trim();
        if (piece === '')
            throw new CronError(`cron ${name} 字段存在空片段: "${raw}"`);
        // 步进：a/b 或 */b 或 a-b/b
        const stepSplit = piece.split('/');
        if (stepSplit.length > 2)
            throw new CronError(`cron ${name} 字段步进语法非法: "${piece}"`);
        const rangeText = stepSplit[0];
        const step = stepSplit.length === 2 ? Number(stepSplit[1]) : 1;
        if (!Number.isInteger(step) || step < 1)
            throw new CronError(`cron ${name} 字段步进必须为正整数: "${piece}"`);
        let lo;
        let hi;
        if (rangeText === '*') {
            lo = spec.min;
            hi = spec.max;
        }
        else if (rangeText.includes('-')) {
            const bounds = rangeText.split('-');
            if (bounds.length !== 2)
                throw new CronError(`cron ${name} 字段范围非法: "${piece}"`);
            lo = Number(bounds[0]);
            hi = Number(bounds[1]);
        }
        else {
            lo = Number(rangeText);
            hi = stepSplit.length === 2 ? spec.max : lo; // 单值 + 步进 = 单值
        }
        if (!Number.isInteger(lo) || !Number.isInteger(hi))
            throw new CronError(`cron ${name} 字段含非数字: "${piece}"`);
        // 周日 7 归一到 0
        if (name === 'dow') {
            if (lo === 7)
                lo = 0;
            if (hi === 7)
                hi = 7; // 0-7 范围包含 0；单独 7 已归一
        }
        if (lo < spec.min || hi > spec.max || lo > hi) {
            throw new CronError(`cron ${name} 字段越界: "${piece}"（合法 ${spec.min}-${spec.max}）`);
        }
        for (let v = lo; v <= hi; v += step)
            values.add(name === 'dow' && v === 7 ? 0 : v);
    }
    if (values.size === 0)
        throw new CronError(`cron ${name} 字段为空`);
    return values;
}
/** 解析五字段 cron 表达式。非法即抛 CronError。 */
export function parseCron(expr) {
    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 5)
        throw new CronError(`cron 表达式必须为 5 个字段（分 时 日 月 周）: "${expr}"`);
    const minute = parseField(parts[0], FIELDS.minute, 'minute');
    const hour = parseField(parts[1], FIELDS.hour, 'hour');
    const dom = parseField(parts[2], FIELDS.dom, 'dom');
    const month = parseField(parts[3], FIELDS.month, 'month');
    const dow = parseField(parts[4], FIELDS.dow, 'dow');
    return {
        minute, hour, dom, month, dow,
        domRestricted: parts[2].trim() !== '*',
        dowRestricted: parts[4].trim() !== '*',
    };
}
/** 解析结果缓存（表达式 → 解析物），tick 高频调用零重复解析。 */
const parseCache = new Map();
export function parseCached(expr) {
    let parsed = parseCache.get(expr);
    if (parsed === undefined) {
        parsed = parseCron(expr);
        if (parseCache.size > 500)
            parseCache.clear();
        parseCache.set(expr, parsed);
    }
    return parsed;
}
/**
 * 判定给定时刻是否命中 cron 表达式（本地时区）。
 * 日/周标准 OR 语义：两者都受限时，日命中或周命中即触发；只限制其一则该维必须命中。
 */
export function cronMatches(expr, at) {
    const c = parseCached(expr);
    if (!c.minute.has(at.getMinutes()))
        return false;
    if (!c.hour.has(at.getHours()))
        return false;
    if (!c.month.has(at.getMonth() + 1))
        return false;
    const domHit = c.dom.has(at.getDate());
    const dowHit = c.dow.has(at.getDay());
    if (c.domRestricted && c.dowRestricted) {
        if (!domHit && !dowHit)
            return false;
    }
    else if (c.domRestricted) {
        if (!domHit)
            return false;
    }
    else if (c.dowRestricted) {
        if (!dowHit)
            return false;
    }
    return true;
}
/** 分钟级时间键（同分钟去重防重用，本地时区）。 */
export function minuteKey(at) {
    const p = (n) => String(n).padStart(2, '0');
    return `${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())} ${p(at.getHours())}:${p(at.getMinutes())}`;
}
