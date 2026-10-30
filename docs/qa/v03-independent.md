# 独立 QA：v0.3 重点比赛与存档

日期：2026-10-29。仅新增测试和本报告，没有修改产品代码。

## 交付与范围

`tests/integration/live-save-v03.test.ts` 新增六项测试，使用实际 catalog、领域命令、Zod 保存校验与 fake-indexeddb 数据库事务。

1. 进入重点比赛，逐节持久化至IndexedDB并读回，前三节零金币/零个人赛果，第四节才结算且同commandId不重复发奖；包含罚球得分守恒和非负分钟。
2. 经过真实schema保存/读档后，四节默认战术与快速模拟的比分、双方box和奖励相同。
3. 用固定种子搜索实际模拟出的首节平局，确认live可以保存，不误当成终场失败。
4. 损坏prefix统计、非本队重点球员、非法战术被拒绝，已提交状态不变。
5. v0.2规则标记的真实比赛存档迁移到当前规则后，历史赛果、金币、revision保留，并补年龄/状态和迁移记录。
6. 静态检查UI比分/走势仅依赖播放cursor截取事件，累计box在当前节回放结束后揭晓；刷新加载已完成节可直接到节末。

## 首次运行

`npm test -- --run tests/integration/live-save-v03.test.ts`：六项中四项通过、两项失败。失败均为schema保存后继续第二节时报SIMULATION_PREFIX_CHANGED。

已精确定位：Zod重新构造MatchEvent时改变对象键顺序，事件内容与类型均未变化；Node `isDeepStrictEqual(expected.events, parsed.events)`为true，`JSON.stringify`比较为false。domain前缀防护使用JSON字符串比较，导致把正常读档当作历史回合被改写。已将复现和原因发给Lead。不能通过删除防护或跳过测试规避，应改为稳定的字段/结构比较。

## 未覆盖

本轮没有做浏览器实际点击/动画体验、Windows、断网或真实NBA数据核对。静态不剧透断言不能代替浏览器检查。游戏数值系数并非已与真实NBA样本拟合。

## 当前结论

2026-10-30主Agent已改用稳定结构序列化比较，保留真实篡改拒绝。六项全部通过，完整测试44项通过。主Agent在固定预构建包中完成四节，首节后刷新并换战术续赛，105–128，26金币仅发放一次，桌面/手机布局通过检查。以上首次失败和未覆盖为独立Agent当时记录；浏览器复验由主Agent完成，不冒称独立执行。详见current-status.md。
