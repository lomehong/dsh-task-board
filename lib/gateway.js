/**
 * typertGateway 接线封装。
 *
 * wire-args 布局是 0.1.2 系 descriptor 表的硬约束（assertExactArguments 对
 * 多余/缺失的 args 键都会抛 arguments-invalid）：
 * - agentPresets/list 无参数 → args 必须为 {}
 * - session/list 的请求参数走 '_request' 键
 * - 其余 session 方法（create/rename/prompt/page）走 'request' 键
 */
export function wireArgs(namespace, method, request) {
    if (namespace === 'agentPresets' && method === 'list')
        return {};
    if (namespace === 'session' && method === 'list')
        return { _request: request };
    return { request };
}
export class GatewayClient {
    gateway;
    constructor(gateway) {
        this.gateway = gateway;
    }
    invoke(namespace, method, request = {}) {
        return this.gateway.invoke({ namespace, method, args: wireArgs(namespace, method, request) });
    }
}
export function sessionAddress(sessionId) {
    return { kind: 'session', sessionId };
}
