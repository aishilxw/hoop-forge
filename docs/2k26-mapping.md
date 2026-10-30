# NBA 2K26 九维评分映射

## 来源与版本

使用第三方公开归档 wkoverfield/blacktop-blitz，冻结commit 90a25a24c54198799c2816730ee181731e3b4a55。games.json把players-2k26.json标为2K26并记录capturedAt 2026-08-08T06:51:10Z。这证明归档的版本标签，不代表2K官方验证或当前现实合同名单。

原始数据包含1889行，其中curr为672行；all-time和classic不进入匹配池。原始JSON、版本清单和SHA256保留于data/2k26。逐人匹配/未匹配名单见processed/mapping-audit.json。

## 九维映射规则

| 本游戏字段 | 归档字段                         |
| ---------- | -------------------------------- |
| 内线得分   | cats.ins                         |
| 外线得分   | cats.out                         |
| 内线防守   | attributes.interiorDefense       |
| 外线防守   | attributes.perimeterDefense      |
| 组织       | cats.ply                         |
| 运球       | attributes.ballHandle            |
| 速度       | attributes.speed                 |
| 身体       | attributes.strength              |
| 篮板       | 攻防篮板属性的算术平均，四舍五入 |

类别分数已由归档计算，不能把其称为未经转换的单一2K属性。原始范围包含25，因此本游戏能力允许25–99，保留低属性而不统一抬高。

## 匹配与缺口

2026-10-29逐队521人名单中446人匹配、75人未匹配。优先去除变音符号和标点后精确匹配，仅对唯一候选允许去除Jr/Sr等后缀。脚本拒绝同一源行匹配多个人。

匹配成功评分标derived/medium，未匹配继续标estimated/low，卡面明确显示。未匹配球员不是已查到2K26数值。名单整体status仍为partial：当前球队归属已改为RealGM逐队当前名单，并与可读官方页面部分交叉核对，仍待官方全量逐人核验；不能以该第三方参考名单声称已经完成全量现役名单验证。

重建：node --import tsx scripts/import-2k26.ts；校验：npm run validate:data。
