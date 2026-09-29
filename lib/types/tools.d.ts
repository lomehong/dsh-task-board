/**
 * 任务看板的模型工具入口：preset 行（`name: '@dsh-extra/dsh-task-board/tools'`）
 * 引用本模块，挂载后的分身会话获得 task_report 工具——把执行结果结构化回填
 * 看板（状态 + 给主人看的摘要），替代宿主侧 turn/end 推断与模板句回填
 * （套件宪章第二阶段「任务层间挂链」）。
 *
 * 注册形态：鸭子类型 tools.register（对齐 dsh-computer/tools），不引入
 * dsh-tools 运行时依赖；看板存储经同包 ledger.ts 单写者事务访问。
 * 注册失败降级为跳过：绝不让工具注册问题炸掉会话创建。
 *
 * @module @dsh-extra/dsh-task-board/tools
 */
import type { Context } from '@deepseek-ai/cordis';
/** 看板服务的最小结构视图（对话内下单/认领用；宿主 index.ts 经 injectServiceGetter 注入）。 */
interface DelegateService {
    createWithGovernance(input: {
        title: string;
        prompt: string;
        actionType: string;
        targetScope: string;
        actionLevel: 'L0' | 'L1' | 'L2' | 'L3';
        cron?: string;
    }): Promise<{
        id: string;
        title: string;
    }>;
    run(id: string, trigger: string): Promise<{
        status?: string;
    }>;
    /** 会话认领执行（task_claim）：把调用会话绑定为执行现场，认领即治理裁决 */
    claim(taskId: string, sessionId: string, trigger?: string): {
        status?: string;
        sessionId?: string;
        summary?: string;
    };
}
/** 注入看板服务获取器（宿主 index.ts apply 内接线；工具执行时惰性解析）。 */
export declare function injectServiceGetter(getter: (() => DelegateService | undefined) | undefined): void;
export declare const name = "tool-task-board";
export declare const inject: string[];
export declare function apply(ctx: Context): void;
/**
 * 全模式注册（v0.3.0）：宿主 index.ts apply 直接调用——看板四件套工具
 * （task_report / task_delegate / task_claim / task_approve）不再依赖预设行挂载，
 * 任何 agent 预设（标准/PTC/极简/创造/数字分身）的会话都可获得（宪章 §0：
 * 任务看板是实例级资产）。会话归属与调用方身份由宿主在 execute 注入的
 * `exec.agent.id` 调用时解析（不可伪造），与注册方式无关。
 * 注册失败降级为跳过：绝不让工具注册问题炸掉会话创建。
 */
export declare function registerTaskTools(ctx: Context): void;
export {};
