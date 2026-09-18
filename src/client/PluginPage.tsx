/**
 * 「插件」管理页配置区（plugins.bundle.config，key=@dsh-extra/dsh-task-board）。
 *
 * - `view: 'summary'`：插件卡片上的一行简介（无 hooks，owner 可能以普通函数调用渲染器）。
 * - `view: 'page'`：看板状态速览（只读）——五列计数 + 治理徽标 + 最近完成 5 条；
 *   完整看板操作在会话「任务看板」Tab / 全局面板，此处不做第二操作入口。
 */
import { useEffect, useState } from 'react'

interface RunLike { status?: string; finishedAt?: string; summary?: string }
interface TaskLike { id: string; title: string; column: string; archived?: boolean; updatedAt: string; runs: RunLike[] }
interface StateLike { tasks: TaskLike[]; governance?: { mode?: '账本' | '本地' } }

const c = {
  text: 'var(--dsw-alias-label-primary, #1f2329)',
  sub: 'var(--dsw-alias-label-secondary, #4e5969)',
  faint: 'var(--dsw-alias-label-tertiary, #86909c)',
  bg: 'var(--dsw-alias-bg-base, #ffffff)',
  layer: 'var(--dsw-alias-bg-layer-1, #f7f8fa)',
  border: 'var(--dsw-alias-separator-primary, #e5e6eb)',
  accent: 'var(--dsw-alias-state-business-primary, #3370ff)',
  ok: 'var(--dsw-alias-state-success-primary, #00b42a)',
  warn: 'var(--dsw-alias-state-warn-primary, #ff7d00)',
}

const sectionStyle = { border: `1px solid ${c.border}`, borderRadius: 8, padding: '12px 16px', background: c.bg, marginBottom: 12 }
const titleStyle = { fontSize: 13, fontWeight: 600, color: c.text, margin: '0 0 8px' }
const hintStyle = { fontSize: 12, color: c.sub, lineHeight: 1.5 }
const cellStyle = { padding: '10px 14px', borderRadius: 8, background: c.layer, textAlign: 'center' as const }
const cellNumStyle = { fontSize: 20, fontWeight: 700, color: c.text }
const cellLabelStyle = { fontSize: 11.5, color: c.faint, marginTop: 2 }

/** 只读状态速览（有状态，由 React 渲染）。 */
function StatusPage(): JSX.Element {
  const [state, setState] = useState<StateLike | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch('/dsh-task-board/state', { headers: { Accept: 'application/json' } })
      .then((r) => r.json() as Promise<{ ok: boolean; state?: StateLike }>)
      .then((d) => {
        if (d.ok && d.state !== undefined) setState(d.state)
        else setError(true)
      })
      .catch(() => setError(true))
  }, [])

  if (error) return <div style={{ ...hintStyle, color: c.warn }}>看板状态获取失败（dsh-task-board 宿主服务不可用？）。</div>
  if (state === null) return <div style={hintStyle}>加载看板状态中…</div>

  const active = state.tasks.filter((t) => t.archived !== true)
  const count = (col: string) => active.filter((t) => t.column === col).length
  const pendingApprovals = active.reduce((n, t) => n + t.runs.filter((r) => r.status === '待审批').length, 0)
  const pendingConfirms = active.reduce((n, t) => n + t.runs.filter((r) => r.status === '待确认').length, 0)
  const recent = active
    .filter((t) => t.column === '已完成' || t.column === '已失败')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5)

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={sectionStyle}>
        <div style={{ ...titleStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>看板概况</span>
          {state.governance?.mode === '本地' ? (
            <span style={{ fontSize: 11.5, fontWeight: 600, color: c.warn }}>⚠ 账本未安装 · 本地降级治理</span>
          ) : (
            <span style={{ fontSize: 11.5, fontWeight: 600, color: c.ok }}>✓ 账本治理就绪</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            ['进行中', count('进行中')],
            ['待办', count('待办')],
            ['待规划', count('待规划')],
            ['待审批', pendingApprovals],
            ['待确认', pendingConfirms],
          ].map(([label, n]) => (
            <div key={String(label)} style={{ ...cellStyle, minWidth: 84 }}>
              <div style={cellNumStyle}>{n}</div>
              <div style={cellLabelStyle}>{label}</div>
            </div>
          ))}
        </div>
        <div style={{ ...hintStyle, marginTop: 8 }}>
          布置 → 账本裁决（L2/L3 需批准）→ 分身执行 → task_report 自报（待确认）→ 主人确认才落终态。
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={titleStyle}>最近完成 / 失败（5 条）</div>
        {recent.length === 0 ? (
          <div style={hintStyle}>暂无已结算任务。</div>
        ) : (
          recent.map((t) => {
            const last = t.runs.length > 0 ? t.runs[t.runs.length - 1] : undefined
            return (
              <div key={t.id} style={{ padding: '6px 0', borderBottom: `1px dashed ${c.border}`, fontSize: 12.5, color: c.sub }}>
                <span style={{ color: c.text, fontWeight: 600 }}>{t.title}</span>
                <span style={{ marginLeft: 8, color: t.column === '已失败' ? c.warn : c.ok }}>{t.column}</span>
                {last?.summary !== undefined && last.summary !== '' ? <span> · {last.summary.slice(0, 80)}</span> : null}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

/** 插件页配置入口：summary 一行简介（无 hooks）；page 渲染只读状态速览。 */
export function TaskBoardPluginConfig(props: { view: 'summary' | 'page' }): JSX.Element {
  if (props.view === 'page') return <StatusPage />
  return (
    <span style={{ fontSize: 12, color: c.sub }}>
      看板=唯一活动权威：布置 → 账本裁决 → 分身执行 → 自报 → 主人确认；完整看板在会话「任务看板」Tab。
    </span>
  )
}
