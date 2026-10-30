# 篮球融合生涯网页版

托管包装层复用 Hoop Forge 0.3.4 原版 Vue 构建，浏览器 IndexedDB 存档。根路径跳转 /play/index.html，静态资源同目录加载。模型接口固定转发到现有共享AI服务，云端 REVIEW_BUILD_ID 配置试玩标识，不持有 DeepSeek 密钥。

共享AI沿用既有累计/每日/设备额度和到期日。网页版设备标识由 HttpOnly cookie 保存，清理cookie可改变设备身份，因此全局持久额度是主要保护。无登录、无云端存档，不跨浏览器自动同步。原本地存档可手动导入。

更新玩法时先在仓库根目录构建，运行 npm run prepare:web 将 dist 内容复制到本目录 public/play，再构建本项目。基础游戏逻辑与原版一致，首次访问需要联网；尚未实现可离线安装的PWA。不要把服务端 Secret 写入前端资源。
