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
export declare class CronError extends Error {
}
export interface ParsedCron {
    minute: Set<number>;
    hour: Set<number>;
    dom: Set<number>;
    month: Set<number>;
    dow: Set<number>;
    /** 日/周是否都受限（标准 OR 语义判定用） */
    domRestricted: boolean;
    dowRestricted: boolean;
}
/** 解析五字段 cron 表达式。非法即抛 CronError。 */
export declare function parseCron(expr: string): ParsedCron;
export declare function parseCached(expr: string): ParsedCron;
/**
 * 判定给定时刻是否命中 cron 表达式（本地时区）。
 * 日/周标准 OR 语义：两者都受限时，日命中或周命中即触发；只限制其一则该维必须命中。
 */
export declare function cronMatches(expr: string, at: Date): boolean;
/** 分钟级时间键（同分钟去重防重用，本地时区）。 */
export declare function minuteKey(at: Date): string;
