# 网页版与共享AI部署

当前在线试玩：https://hoop-forge-play.artfulpika132.chatgpt.site

普通游玩和本地启动都不需要部署云端。下列目录仅用于理解架构或在自己的账户部署。

## 结构

根目录是Vue游戏；deploy/web托管静态游戏与/api/ai固定转发；deploy/shared-ai持有模型Secret并使用D1记录持久额度、请求状态和24小时生成缓存。网页转发与可下载本地服务复用相同报告/教练协议。

仓库内的.openai/hosting.json只保留绑定类型，没有现有生产站点身份。不要把自己的仓库指向其他人的Sites源码远程，也不要提交拥有者令牌。使用Sites插件为自己的项目注册站点并配置身份；需要发布时使用其源码、构建与部署流程。

## 网页游戏资源

在仓库根目录执行：

```sh
npm ci
npm run build
npm run prepare:web
```

静态游戏复制到deploy/web/public/play/（生成资源不进Git）。然后在deploy/web安装依赖并构建：

```sh
npm ci
npm run build
```

网页Secret REVIEW_BUILD_ID必须对应共享AI服务接受的试玩标识。该层没有DeepSeek密钥。生产入口自动跳转/play/，浏览器请求同域/api/ai；代理固定上游、校验Origin与JSON、限制24KB，使用HttpOnly cookie作为设备标识。边缘运行环境使用redirect:manual并拒绝3xx，不能使用不支持的redirect:error。

## 自有共享AI服务

deploy/shared-ai需要D1绑定DB，应用drizzle/里的迁移，再配置云端Secret：

- DEEPSEEK_API_KEY、DEEPSEEK_MODEL
- REVIEW_ENABLED、REVIEW_BUILD_ID、REVIEW_SESSION_ID、REVIEW_EXPIRES_AT
- REVIEW_TOTAL_LIMIT、REVIEW_DAILY_LIMIT、REVIEW_DEVICE_DAILY_LIMIT

具体含义、上限和缓存规则见该目录README。密钥通过云端环境设置传入，不写入构建文件。自行部署不同上游时，应同时修改deploy/web/lib/game-ai.mjs的固定地址与本地review.config.json，不开放任意用户指定的代理地址。

每次游戏更新后重新运行prepare:web并构建；修改共享提示词或验证规则时，同时维护本地scripts/release/与云端lib/hoop-forge/中的对应代码，并测试协议兼容。此仓库不提供持有生产权限的自动发布脚本。

## 检查

```sh
# 在仓库根目录，Node24，无需部署目录的React依赖
node --test deploy/web/tests/game-ai.test.mjs
node --test deploy/shared-ai/tests/review-service.test.mjs
```

网页存档仅在各浏览器中，不是云存档。没有PWA或首次离线打开保证。
