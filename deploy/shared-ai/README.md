# Hoop Forge 共享 AI 服务

为面试试玩包提供只需联网、无需自备模型密钥的生涯报告与场边教练。底层使用游戏原有DeepSeek Flash提示词与输出校验，不公开DeepSeek密钥。

运行在Sites/Vinext/Cloudflare Workers，D1负责持久化额度和24小时生成缓存。数据库迁移属于drizzle/，请求期间不建表。

## 运行时设置（通过Sites环境变量配置）

- DEEPSEEK_API_KEY：密钥，只存云端secret。
- DEEPSEEK_MODEL：deepseek-flash。
- REVIEW_ENABLED：true开启，false关闭共享模型调用。
- REVIEW_BUILD_ID：与试玩包的公开可撤销通行标识匹配。它可以被下载者提取，不应视作保密认证；费用防护以持久化全局额度为准。
- REVIEW_SESSION_ID：本期试玩计量范围，正常部署保持不变；主动换新值会开启新一轮计量。
- REVIEW_EXPIRES_AT：明确的UTC有效期；缺失或无效值拒绝服务。
- REVIEW_TOTAL_LIMIT：本期总调用上限，默认500，最大2000。
- REVIEW_DAILY_LIMIT：每日UTC上限，默认100，最大500。
- REVIEW_DEVICE_DAILY_LIMIT：每个安装标识每日上限，默认30，最大100。

另有每安装标识每分钟6次、全局3并发，过期90秒的并发预留自动解除，但历史调用仍计入总额度。安装标识可伪造或重置，因此不能单独作为防滥用边界。每次准备调用模型时用单条SQL原子预留；失败也保守计数，缓存命中不计入调用。以上限制是这个网关的限制，不是整个DeepSeek账户的金额上限。

只允许固定报告/教练路由与有界JSON材料，调用既有固定提示词，不能指定上游地址、模型密钥或任意消息数组。输入最多24KB。模型密钥、认证头和原始玩家输入不写入调用日志。D1缓存保存生成正文及用量，不重复保存原始事实对象，24小时后不再读取，正文仍可能包含玩家自取姓名。

## 检查

`node --test tests/review-service.test.mjs`：SQLite真实语句测试鉴权、禁用、到期、缓存、原子额度、并发和失败计量。
`npx tsc --noEmit`；构建使用Sites提供的build-site.mjs。

## 外部访问

该服务按用户“面试官下载后无需登录或模型配置”的要求允许外部网络访问。公开首页只介绍服务；AI路由校验试玩标识和持久化额度。完整游戏入口与源码说明见仓库根README；不提供无限免费模型服务。
