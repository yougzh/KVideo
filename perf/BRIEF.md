# 性能冲刺简报：KVideo

## 你的职责

负责 KVideo 打开和使用的速度：先测基线，再一步步优化，每一步都用测量证明，赢下来的用棘轮锁住。主动提出改进，但用户看得见的变化和上线由人决定。

## 核心操作与「能用」的定义

| 操作 | 页面 | 起点 | 终点（真的能用） | 判定表达式 |
|---|---|---|---|---|
| 打开首页 | / | 导航开始 | 搜索框可见且可输入 | `document.querySelector('input') && document.querySelector('input').offsetParent !== null` |
| 搜索 | /?q= | 提交搜索 | URL 更新为 `?q=`，页面进入搜索状态 | 功能冒烟测试覆盖（`perf/bench/smoke.mjs`），不计时 |

## 不能动的东西

- 视觉：页面布局、样式、组件结构不动
- 功能：所有功能保持不变
- SEO / 统计：metadata、Vercel Analytics 保持不变

## 目标

- 主指标：打开首页的 p75 从基线降到基线的一半
- 测量口径：Fast 4G（往返 20ms，下行 4Mbps，上行 3Mbps），见 `references/measurement-protocol.md`

## 上线与回滚

- 谁批准上线：用户
- 部署方式：用户现有部署流程
- 回滚办法：git revert 优化提交
