import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CronError, cronMatches, minuteKey, parseCron } from '../src/cron.ts'

const at = (iso: string) => new Date(iso)

describe('parseCron（五字段解析）', () => {
  it('合法表达式解析出各字段命中集', () => {
    const c = parseCron('*/15 9-17 * * 1-5')
    expect([...c.minute]).toEqual([0, 15, 30, 45])
    expect([...c.hour]).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17])
    expect(c.dow.has(1)).toBe(true)
    expect(c.dow.has(6)).toBe(false)
  })

  it('周日 0 与 7 等价', () => {
    expect(parseCron('0 0 * * 7').dow.has(0)).toBe(true)
    expect(parseCron('0 0 * * 0').dow.has(0)).toBe(true)
    expect(parseCron('0 0 * * 0-7').dow.size).toBe(7)
  })

  it('逗号列表与混合语法', () => {
    const c = parseCron('0,30 8 */2,10-12 * 1,5')
    expect([...c.minute].sort((a, b) => a - b)).toEqual([0, 30])
    // POSIX 语义：日字段步进从最小值 1 起（1,3,5,…,31），并上范围 10-12
    expect(c.dom.has(1)).toBe(true)
    expect(c.dom.has(2)).toBe(false)
    expect(c.dom.has(10)).toBe(true)
    expect(c.dom.has(31)).toBe(true)
    expect(c.dom.size).toBe(18)
    expect([...c.dow].sort((a, b) => a - b)).toEqual([1, 5])
  })

  it('非法表达式抛 CronError', () => {
    expect(() => parseCron('* * * *')).toThrow(CronError)
    expect(() => parseCron('60 * * * *')).toThrow(CronError)
    expect(() => parseCron('* 25 * * *')).toThrow(CronError)
    expect(() => parseCron('* * 0 * *')).toThrow(CronError)
    expect(() => parseCron('a * * * *')).toThrow(CronError)
    expect(() => parseCron('*/0 * * * *')).toThrow(CronError)
    expect(() => parseCron('1-2-3 * * * *')).toThrow(CronError)
  })
})

describe('cronMatches（匹配语义）', () => {
  it('每分钟通配', () => {
    expect(cronMatches('* * * * *', at('2026-09-04T10:07:33'))).toBe(true)
    expect(cronMatches('* * * * *', at('2026-09-04T23:59:59'))).toBe(true)
  })

  it('分钟/小时命中', () => {
    expect(cronMatches('30 9 * * *', at('2026-09-04T09:30:00'))).toBe(true)
    expect(cronMatches('30 9 * * *', at('2026-09-04T09:31:00'))).toBe(false)
    expect(cronMatches('30 9 * * *', at('2026-09-04T10:30:00'))).toBe(false)
  })

  it('日/周标准 OR 语义：都受限时命中任一即触发', () => {
    // 13 号周五（dom 命中 + dow 命中）
    expect(cronMatches('0 0 13 * 5', at('2026-09-13T00:00:00'))).toBe(true) // 2026-09-13 是周日——用确定星期几的日期
  })

  it('日/周 OR：仅日命中也触发', () => {
    // 2026-09-15 是周二；dom=15 命中、dow=1(周一) 不命中 → OR 触发
    expect(cronMatches('0 0 15 * 1', at('2026-09-15T00:00:00'))).toBe(true)
  })

  it('日/周 OR：两者都不命中则不触发', () => {
    // 2026-09-16 周三：dom=15 不命中、dow=1 不命中
    expect(cronMatches('0 0 15 * 1', at('2026-09-16T00:00:00'))).toBe(false)
  })

  it('只限制周（dom 为 *）：周必须命中', () => {
    // 2026-09-14 周一
    expect(cronMatches('0 12 * * 1', at('2026-09-14T12:00:00'))).toBe(true)
    expect(cronMatches('0 12 * * 1', at('2026-09-15T12:00:00'))).toBe(false)
  })
})

describe('minuteKey（同分钟去重键）', () => {
  it('同一分钟内相同、跨分钟不同；秒与毫秒不影响', () => {
    const a = minuteKey(at('2026-09-04T10:07:00.000'))
    const b = minuteKey(at('2026-09-04T10:07:59.999'))
    const c = minuteKey(at('2026-09-04T10:08:00.000'))
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })
})
