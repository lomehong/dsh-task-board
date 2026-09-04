/**
 * typertGateway 接线封装。
 *
 * wire-args 布局是 0.1.2 系 descriptor 表的硬约束（assertExactArguments 对
 * 多余/缺失的 args 键都会抛 arguments-invalid）：
 * - agentPresets/list 无参数 → args 必须为 {}
 * - session/list 的请求参数走 '_request' 键
 * - 其余 session 方法（create/rename/prompt/page）走 'request' 键
 */

export interface GatewayInvokeSpec {
  namespace: string
  method: string
  args: Record<string, unknown>
  signal?: AbortSignal
}

export interface TypertGateway {
  invoke(spec: GatewayInvokeSpec): Promise<unknown>
  stream?(spec: GatewayInvokeSpec): Promise<AsyncIterable<unknown>>
}

export interface SessionSummary {
  sessionId: string
  running?: boolean
  title?: string
}

export interface SessionPage {
  records: ReadonlyArray<{ event: { type: string; seq: number; time: number; data: unknown } }>
  hasMore?: boolean
  cursor?: number
}

export function wireArgs(namespace: string, method: string, request: Record<string, unknown>): Record<string, unknown> {
  if (namespace === 'agentPresets' && method === 'list') return {}
  if (namespace === 'session' && method === 'list') return { _request: request }
  return { request }
}

export class GatewayClient {
  constructor(private readonly gateway: TypertGateway) {}

  invoke(namespace: string, method: string, request: Record<string, unknown> = {}): Promise<unknown> {
    return this.gateway.invoke({ namespace, method, args: wireArgs(namespace, method, request) })
  }
}

export function sessionAddress(sessionId: string): { kind: 'session'; sessionId: string } {
  return { kind: 'session', sessionId }
}
