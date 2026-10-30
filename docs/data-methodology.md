# NBA 2026–27 名单与评分说明（v2）

## 名单：当前公开逐队快照

游戏名单已从原来的518人预赛参考表替换为2026-10-29逐队读取的RealGM 2026–2027 Regular Season Roster：30队、521人。只读取每队第一个常规赛名单表，不纳入下方的选秀权、自由球员权利或历史名单。球队归属不使用2K旧赛季球队信息推断。

逐队来源、人数、原始提取事实保存在data/realgm-rosters-2026-10-29.json和data/source-manifest.json。此来源属于可核查的第三方当前名单，不能称为NBA官方直接导出的全量名单。

NBA官方opening-rosters页面链接至各球队名单。76人与热火页面可读取，名单中17人各自与当前RealGM逐人一致；其余28队页面在可用工具中只返回脚本容器或Access Denied。逐队审计保存在data/official-roster-audit-2026-10-29.json。NBA官网league players总表显示522人，与逐队源521人差1人，尚未定位差异，因此catalog仍为partial，不伪称完成官方全量验收。

## 球员身份和位置

已有NBA ID在姓名匹配后保留。新增且尚无已核查NBA ID者，使用realgm-开头的稳定姓名哈希ID；这不是冒充官方NBA ID。手工姓名别名用于Moe/Moritz Wagner、Nic/Nicolas Claxton、Jay/James Huff、Ron/Ronald Holland等明确同人差异。ID与显示名字分离。

位置来自当前RealGM球员表：含C归内线、否则含G归后卫、其余归锋线。双位置只进入一个抽卡池。src/data/teams.ts固定30个真实球队中文名称、东西部、六赛区以及球员ID归属，程序校验每人恰好属于一队。

## 中文名字

全部521名球员都有中文显示名。主要使用虎扑公开球队双语表的中英姓名对应，不使用其较宽的21人季前名单决定现役资格。英文姓名规范化后与当前名单连接。常用明星译名少量统一，杜普·里斯、托尼·布拉德利、肖恩·佩杜拉等缺失项使用明确记录的人工标准音译。data/chinese-name-audit.json逐人保留来源，不能把人工音译声称为官方译名。

## 九维评分

446人映射2K26第三方冻结归档，其余75人没有该版本可验证属性，仍保留estimated/low评分并在界面标注。新秀等缺失评分只是原型估计，不是查到的2K26数值。不得在发布说明中称全部球员评分已真实验证。

九维映射、原始字段、来源commit及未匹配名单见docs/2k26-mapping.md与data/2k26/processed/mapping-audit.json。评分来源与当前球队归属是两条独立证据链：旧2K球队不覆盖当前名单。

## 可复现操作

1. data/rebuild-real-rosters.py：从已冻结的当前名单与双语事实文件构建名单、中文名、球队元数据；需要已有稳定ID参考。
2. node --import tsx scripts/import-2k26.ts：从冻结2K26归档映射评分，保留真实25–99范围。
3. npm run validate:data：检查中文名、九维、版本、30队/分区、每人唯一归属和抽卡池。
4. npm run validate:data -- --release：当前故意失败，因为数据仍partial；不能绕过此闸门假称正式全量已验收。
