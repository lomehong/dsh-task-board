/**
 * typertGateway 接线封装。
 *
 * wire-args 布局是 0.1.2 系 descriptor 表的硬约束（assertExactArguments 对
 * 多余/缺失的 args 键都会抛 arguments-invalid）：
 * - agentPresets/list 无参数 → args 必须为 {}
 * - session/list 的请求参数走 '_request' 键
 * - 其余 session 方法（create/rename/prompt/page）走 'request' 键
 *
 * 2026-11-16 事故修正（宿主 0.2.0-rc.2 → 0.2.2-rc.3 自愈升级后）：宿主网关把
 * InvokeRemoteRequest.peer 升为必填（"every carrier and in-process caller names it
 * explicitly"），不带 peer 的 invoke 在 assertPeerLive 读 peer.signal 直接抛
 * "Cannot read properties of undefined (reading 'signal')"。修正：进程内经
 * connection.createPeer({ principal: { kind: 'owner' } }) 建一只 owner Peer，
 * 随 GatewayClient 注入每一次 invoke/stream/invokeSpec。
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
    peer;
    constructor(gateway, peer) {
        this.gateway = gateway;
        this.peer = peer;
    }
    invoke(namespace, method, request = {}) {
        return this.gateway.invoke({ namespace, method, args: wireArgs(namespace, method, request), peer: this.peer });
    }
    /** 直通调用：调用方自行组装完整 spec（如 goals/create 的 agentId+request 双参形态）；
     *  未带 peer 的 spec 注入本客户端的 owner Peer。 */
    invokeSpec(spec) {
        return this.gateway.invoke({ ...spec, peer: spec.peer ?? this.peer });
    }
    stream(namespace, method, request) {
        if (this.gateway.stream === undefined)
            throw new Error('gateway stream is unavailable');
        return this.gateway.stream({ namespace, method, args: wireArgs(namespace, method, request), peer: this.peer });
    }
}
/** 测试/脚本用的假 owner Peer；真实运行时一律经 connection.createPeer 构造。 */
export function testGatewayPeer() {
    return { signal: new AbortController().signal, principal: { kind: 'owner' } };
}
export function sessionAddress(sessionId) {
    return { kind: 'session', sessionId };
}
