/**
 * 任务看板 Host 权威账本：任务/调度/执行记录的唯一事实源。
 *
 * 设计纪律（参考外部实现的工程标杆，自主实现）：
 * - 浏览器只是异步视图：关掉页面调度与结算照常进行，状态以本账本为准；
 * - 原子写：临时文件 + rename，崩溃不留半截状态；
 * - 修订号 revision 随每次变更递增，客户端据此做增量同步判定；
 * - 执行历史每任务封顶 20 条，最旧的在下次执行开始时被裁掉（写成本有界）；
 * - 所有写操作经 serialize 串行化，杜绝并发交错损坏。
 *
 * 存储：$DSH_HOME/dsh-task-board/ledger.json
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

export type TaskColumn = '待规划' | '待办' | '进行中' | '已完成' | '已失败'

export type RunStatus = '运行中' | '成功' | '失败' | '已取消' | '待审批' | '已阻断'

export interface RunRecord {
  id: string
  startedAt: string
  finishedAt?: string
  /** 执行会话 id（创建失败时缺省） */
  sessionId?: string
  status: RunStatus
  /** 结果摘要（回填自账本执行结论） */
  summary?: string
  /** 触发方式 */
  trigger: '手动' | '定时'
}

export interface TaskRecord {
  id: string
  title: string
  /** 执行时投递给分身会话的任务提示词 */
  prompt: string
  column: TaskColumn
  createdAt: string
  updatedAt: string
  /** 归档任务只读（仅可恢复/删除/查看），不可执行不可调度 */
  archived?: boolean
  // ── 执行钉扎（fail-closed：执行前校验，缺失/不可用即拒绝） ──
  /** 工作区 id（缺省用宿主默认工作区） */
  workspaceId?: string
  /** 动作声明（账本裁决输入）：本任务的意图类型与目标范围 */
  actionType: string
  targetScope: string
  /** 动作级别缺省 L1（需要主人圈定范围；L2/L3 意味着更高风险由主人显式调高） */
  actionLevel: 'L0' | 'L1' | 'L2' | 'L3'
  // ── 调度 ──
  /** 5 字段 cron（分 时 日 月 周）；缺省仅手动执行 */
  cron?: string
  /** 上次触发的分钟键（同分钟去重防重） */
  lastMinuteKey?: string
  // ── 最近执行状态 ──
  lastRunAt?: string
  lastSessionId?: string
  lastStatus?: RunStatus
  runs: RunRecord[]
}

export interface TaskBoardStore {
  schemaVersion: 1
  revision: number
  tasks: TaskRecord[]
}

export const MAX_RUNS_PER_TASK = 20

function boardHome(): string {
  return process.env.DSH_HOME ?? join(homedir(), '.dsh')
}

function boardPath(): string {
  return join(boardHome(), 'dsh-task-board', 'ledger.json')
}

export function loadBoard(): TaskBoardStore {
  const path = boardPath()
  if (!existsSync(path)) return { schemaVersion: 1, revision: 0, tasks: [] }
  try {
    const s = JSON.parse(readFileSync(path, 'utf8')) as TaskBoardStore
    return {
      schemaVersion: 1,
      revision: typeof s.revision === 'number' ? s.revision : 0,
      tasks: Array.isArray(s.tasks) ? s.tasks : [],
    }
  } catch {
    try { renameSync(path, `${path}.corrupt-${Date.now()}`) } catch { /* 备份失败只能回空 */ }
    return { schemaVersion: 1, revision: 0, tasks: [] }
  }
}

export function saveBoard(store: TaskBoardStore): void {
  const path = boardPath()
  mkdirSync(dirname(path), { recursive: true })
  store.revision += 1
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmp, `${JSON.stringify(store, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  renameSync(tmp, path)
}

let transacting = false

/**
 * 读改写事务。同步实现即天然串行：所有写操作都是同步 fs（无 await 交错点），
 * 单线程内不可能交错；transacting 标记防重入（将来出现异步需求时先拆掉它）。
 * 校验异常在回调里同步抛出，调用方（路由层）能直接捕获转 HTTP 错误。
 */
export function transact<T>(fn: (store: TaskBoardStore) => T): T {
  if (transacting) throw new Error('任务账本事务重入（内部错误）')
  transacting = true
  try {
    const store = loadBoard()
    const result = fn(store)
    saveBoard(store)
    return result
  } finally {
    transacting = false
  }
}

export function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

/* ── 任务 CRUD（供路由层调用；内部走 transact） ── */

export interface CreateTaskInput {
  title: unknown
  prompt: unknown
  actionType: unknown
  targetScope: unknown
  actionLevel?: unknown
  cron?: unknown
  workspaceId?: unknown
}

const str = (v: unknown, cap: number): string => (typeof v === 'string' ? v.trim().slice(0, cap) : '')

export function createTask(input: CreateTaskInput): TaskRecord {
  const title = str(input.title, 120)
  if (title === '') throw new Error('任务标题不能为空')
  const prompt = str(input.prompt, 8000)
  if (prompt === '') throw new Error('任务提示词不能为空')
  const actionType = str(input.actionType, 40)
  if (actionType === '') throw new Error('动作类型（actionType）不能为空——它是账本裁决的输入')
  const targetScope = str(input.targetScope, 200)
  if (targetScope === '') throw new Error('目标范围（targetScope）不能为空——它是账本裁决的输入')
  const level = input.actionLevel === 'L0' || input.actionLevel === 'L1' || input.actionLevel === 'L2' || input.actionLevel === 'L3'
    ? input.actionLevel
    : 'L1'
  const cron = str(input.cron, 40) || undefined
  const workspaceId = str(input.workspaceId, 80) || undefined
  const now = new Date().toISOString()
  const task: TaskRecord = {
    id: genId('TB'),
    title, prompt,
    column: '待办',
    createdAt: now, updatedAt: now,
    actionType, targetScope, actionLevel: level,
    runs: [],
    ...(cron !== undefined ? { cron } : {}),
    ...(workspaceId !== undefined ? { workspaceId } : {}),
  }
  transact((store) => { store.tasks.push(task) })
  return task
}

export function updateTask(id: string, patch: Partial<CreateTaskInput> & { column?: unknown }): TaskRecord | undefined {
  let out: TaskRecord | undefined
  transact((store) => {
    const t = store.tasks.find(x => x.id === id)
    if (t === undefined) return
    if (t.archived === true) throw new Error('归档任务只读：先恢复再编辑')
    const title = patch.title !== undefined ? str(patch.title, 120) : undefined
    const prompt = patch.prompt !== undefined ? str(patch.prompt, 8000) : undefined
    if (title !== undefined && title !== '') t.title = title
    if (prompt !== undefined && prompt !== '') t.prompt = prompt
    const actionType = patch.actionType !== undefined ? str(patch.actionType, 40) : undefined
    if (actionType !== undefined && actionType !== '') t.actionType = actionType
    const targetScope = patch.targetScope !== undefined ? str(patch.targetScope, 200) : undefined
    if (targetScope !== undefined && targetScope !== '') t.targetScope = targetScope
    if (patch.actionLevel === 'L0' || patch.actionLevel === 'L1' || patch.actionLevel === 'L2' || patch.actionLevel === 'L3') t.actionLevel = patch.actionLevel
    const cron = patch.cron !== undefined ? str(patch.cron, 40) : undefined
    if (cron !== undefined) {
      if (cron === '') delete t.cron
      else t.cron = cron
    }
    const workspaceId = patch.workspaceId !== undefined ? str(patch.workspaceId, 80) : undefined
    if (workspaceId !== undefined) {
      if (workspaceId === '') delete t.workspaceId
      else t.workspaceId = workspaceId
    }
    if (typeof patch.column === 'string' && ['待规划', '待办', '进行中', '已完成', '已失败'].includes(patch.column)) {
      t.column = patch.column as TaskColumn
    }
    t.updatedAt = new Date().toISOString()
    out = t
  })
  return out
}

export function setArchived(id: string, archived: boolean): TaskRecord | undefined {
  let out: TaskRecord | undefined
  transact((store) => {
    const t = store.tasks.find(x => x.id === id)
    if (t === undefined) return
    t.archived = archived || undefined
    if (archived) {
      // 归档任务退出看板活动列，停止调度（执行历史保留供查看）
      t.column = t.column === '进行中' ? '进行中' : t.column
    }
    t.updatedAt = new Date().toISOString()
    out = t
  })
  return out
}

export function deleteTask(id: string): boolean {
  let removed = false
  transact((store) => {
    const before = store.tasks.length
    store.tasks = store.tasks.filter(t => t.id !== id)
    removed = store.tasks.length < before
  })
  return removed
}

export function findTask(store: TaskBoardStore, id: string): TaskRecord | undefined {
  return store.tasks.find(t => t.id === id)
}
