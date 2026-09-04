# dsh-task-board · 任务看板

DeepSeek Harness（dsh）数字分身套件的任务中心化组件：Host 权威任务账本、cron 定时调度、
真实分身会话执行、账本裁决闭环。设计决策见总仓库 `docs/task-board-decisions.md`。

> 实施中——当前已落地数据层（cron 解析器 + 任务账本），执行器/看板 UI 迭代中。

## 设计纪律

- Host 权威账本：任务与执行记录是唯一事实源，浏览器只是异步视图
- 原子写：临时文件 + rename，坏文件改名留证（.corrupt-*）
- 执行历史每任务封顶 20 条
- 账本裁决闭环：任务声明 L0-L3 动作级别 → 执行前过 dsh-ledger 裁决 →
  L2 阻断产生审批（进今日待办）→ 结果回填
- 身份与权限分离：分身人格统一，主人/定时任务全能力（+账本裁决），访客默认收窄
  且增量能力须 Owner 批准

## 开发

```sh
npm install
npm test
npm run build
```
