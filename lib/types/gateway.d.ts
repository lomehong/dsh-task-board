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
/** 进程内调用者的 Peer 最小结构面（结构化类型，不 import 宿主包）。 */
export interface GatewayPeer {
    readonly signal: AbortSignal;
    readonly principal: {
        readonly kind: string;
    };
}
export interface GatewayInvokeSpec {
    namespace: string;
    method: string;
    args: Record<string, unknown>;
    /** 调用者 Peer（宿主 0.2.2 起 invoke/stream 请求必带）。 */
    peer: GatewayPeer;
    signal?: AbortSignal;
}
/** 调用方视角的 spec：peer 可省略，invokeSpec 运行时注入本客户端的 owner Peer。 */
export type GatewayInvokeSpecInput = Omit<GatewayInvokeSpec, 'peer'> & {
    peer?: GatewayPeer;
};
export interface TypertGateway {
    invoke(spec: GatewayInvokeSpec): Promise<unknown>;
    stream?(spec: GatewayInvokeSpec): Promise<AsyncIterable<unknown>>;
}
export interface SessionSummary {
    sessionId: string;
    running?: boolean;
    title?: string;
}
export interface SessionPage {
    records: ReadonlyArray<{
        event: {
            type: string;
            seq: number;
            time: number;
            data: unknown;
        };
    }>;
    hasMore?: boolean;
    cursor?: number;
}
export declare function wireArgs(namespace: string, method: string, request: Record<string, unknown>): Record<string, unknown>;
export declare class GatewayClient {
    private readonly gateway;
    private readonly peer;
    constructor(gateway: TypertGateway, peer: GatewayPeer);
    invoke(namespace: string, method: string, request?: Record<string, unknown>): Promise<unknown>;
    /** 直通调用：调用方自行组装完整 spec（如 goals/create 的 agentId+request 双参形态）；
     *  未带 peer 的 spec 注入本客户端的 owner Peer。 */
    invokeSpec(spec: GatewayInvokeSpecInput): Promise<unknown>;
    stream(namespace: string, method: string, request: Record<string, unknown>): Promise<AsyncIterable<unknown>>;
}
/** 测试/脚本用的假 owner Peer；真实运行时一律经 connection.createPeer 构造。 */
export declare function testGatewayPeer(): GatewayPeer;
export declare function sessionAddress(sessionId: string): {
    kind: 'session';
    sessionId: string;
};
