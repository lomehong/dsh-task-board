/**
 * 执行器：把任务投递给真实的分身会话。
 *
 * 执行链（fail-closed，借鉴外部实现的钉扎纪律）：
 * 1. 校验执行预设存在且未 broken（agentPresets/list）——固定 digital-twin，
 *    分身是唯一的任务执行身份（决策五：预设统一，全工具分身）
 * 2. session/create（钉 workspace + 预设）
 * 3. session/rename（会话名 = 任务标题，便于回溯）
 * 4. session/prompt（mode=queue 投递任务提示词）
 *
 * 完成判定（inspect）：session/list 看会话不在运行 → session/page 回溯找
 * turn/end（时间不早于启动时刻）→ turn/end 带 error 即失败，否则成功；
 * 会话消失 = 已取消；找不到边界 = 仍在进行。
 */
import { GatewayClient, sessionAddress } from './gateway.js';
import { composePrompt } from './prompt.js';
export const EXECUTION_PRESET = 'digital-twin';
export class LaunchError extends Error {
    sessionId;
    constructor(sessionId, message) {
        super(message);
        this.sessionId = sessionId;
    }
}
export class TaskRunner {
    presetId;
    gateway;
    scanMemos = new Map();
    constructor(gateway, 
    /** 执行预设 id；缺省 digital-twin（决策五：分身是唯一执行身份） */
    presetId = EXECUTION_PRESET) {
        this.presetId = presetId;
        this.gateway = gateway instanceof GatewayClient ? gateway : new GatewayClient(gateway);
    }
    /** 投递任务：返回执行会话 id。任何一步失败都抛错（fail-closed，不静默降级）。 */
    async launch(task) {
        // 预设校验（fail-closed 钉扎）：broken 预设的会话挂不出来
        const presets = (await this.gateway.invoke('agentPresets', 'list'));
        const preset = presets.presets?.find(item => item.id === this.presetId);
        if (preset === undefined)
            throw new LaunchError(undefined, `执行预设不存在: ${this.presetId}`);
        if (preset.broken !== undefined)
            throw new LaunchError(undefined, `执行预设不可用: ${preset.broken}`);
        let sessionId;
        try {
            const created = (await this.gateway.invoke('session', 'create', {
                ...(task.workspaceId !== undefined ? { workspaceId: task.workspaceId } : {}),
                agentPreset: this.presetId,
            }));
            sessionId = created.sessionId;
            await this.gateway.invoke('session', 'rename', { sessionId, title: task.title });
            await this.gateway.invoke('session', 'prompt', {
                sessionId,
                requestId: 'task-board-' + crypto.randomUUID(),
                mode: 'queue',
                content: [{ type: 'text', text: composePrompt({ title: task.title, prompt: task.prompt, taskId: task.id, trigger: '手动' }) }],
            });
        }
        catch (error) {
            throw new LaunchError(sessionId, `任务投递失败: ${error instanceof Error ? error.message : String(error)}`);
        }
        return sessionId;
    }
    /** 定时触发与手动共用同一投递链路，仅来源声明不同。 */
    async launchScheduled(task) {
        const presets = (await this.gateway.invoke('agentPresets', 'list'));
        const preset = presets.presets?.find(item => item.id === this.presetId);
        if (preset === undefined)
            throw new LaunchError(undefined, `执行预设不存在: ${this.presetId}`);
        if (preset.broken !== undefined)
            throw new LaunchError(undefined, `执行预设不可用: ${preset.broken}`);
        let sessionId;
        try {
            const created = (await this.gateway.invoke('session', 'create', {
                ...(task.workspaceId !== undefined ? { workspaceId: task.workspaceId } : {}),
                agentPreset: this.presetId,
            }));
            sessionId = created.sessionId;
            await this.gateway.invoke('session', 'rename', { sessionId, title: task.title });
            await this.gateway.invoke('session', 'prompt', {
                sessionId,
                requestId: 'task-board-' + crypto.randomUUID(),
                mode: 'queue',
                content: [{ type: 'text', text: composePrompt({ title: task.title, prompt: task.prompt, taskId: task.id, trigger: '定时' }) }],
            });
        }
        catch (error) {
            throw new LaunchError(sessionId, `任务投递失败: ${error instanceof Error ? error.message : String(error)}`);
        }
        return sessionId;
    }
    /** 完成判定：会话结束运行后回溯事件找 turn/end。 */
    async inspect(sessionId, startedAt) {
        let items;
        try {
            const response = (await this.gateway.invoke('session', 'list'));
            items = response.items ?? [];
        }
        catch {
            return { outcome: 'pending' }; // 会话列表暂不可得：保持进行中，下轮再看
        }
        const summary = items.find(item => item.sessionId === sessionId);
        if (summary === undefined) {
            this.scanMemos.delete(sessionId);
            return { outcome: 'cancelled', error: '执行会话已不存在' };
        }
        if (summary.running === true)
            return { outcome: 'pending' };
        // 会话已结束运行：拉最近事件找本任务启动后的 turn/end
        let page;
        try {
            page = (await this.gateway.invoke('session', 'page', {
                address: sessionAddress(sessionId),
                maxMessages: 200,
            }));
        }
        catch {
            return { outcome: 'pending' };
        }
        const newestSeq = page.records.reduce((acc, r) => acc === undefined ? r.event.seq : Math.max(acc, r.event.seq), undefined);
        if (newestSeq !== undefined && this.scanMemos.get(sessionId) === newestSeq)
            return { outcome: 'pending' }; // 无新事件
        const turnEnd = page.records
            .map(r => r.event)
            .filter(e => e.type === 'turn/end' && e.time * 1000 >= startedAt)
            .sort((a, b) => a.seq - b.seq)[0];
        if (turnEnd === undefined) {
            if (newestSeq !== undefined)
                this.scanMemos.set(sessionId, newestSeq);
            return { outcome: 'pending' };
        }
        this.scanMemos.delete(sessionId);
        const data = turnEnd.data;
        if (data !== null && typeof data === 'object' && typeof data.reason === 'object' && data.reason !== null && data.reason.kind === 'error') {
            return { outcome: 'failed', error: '分身执行轮次以错误结束' };
        }
        return { outcome: 'succeeded' };
    }
}
