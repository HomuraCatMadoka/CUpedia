# 首尔正式镜像

用仓库根目录作为构建上下文。首尔运行 Linux AMD64。基础镜像按摘要锁定，应用和 Sharp 的原生依赖来自同一份 pnpm 锁文件。构建时只使用占位配置，Next.js 构建阶段断开网络。

```sh
docker buildx build --platform linux/amd64 --load \
  --file deploy/seoul-production/Dockerfile \
  --tag cupedia:local-candidate .
```

运行时由服务器提供数据库和应用配置。镜像包含仓库现有的 Supabase 公共签发证书，由 Node.js 通过 `NODE_EXTRA_CA_CERTS` 加载。生产连接沿用 `sslmode=verify-full`。图片处理依赖 Sharp 和原生 libvips。构建会检查证书并调用原生编码器处理一张图片。

使用 `CUPEDIA_PERF_LOG=1` 开启 #934 的课程和 Wiki 分段计时。线上 Nginx 写入 32 位十六进制请求编号，应用只记录符合这一格式的请求。每条日志记录固定路由名、阶段、耗时和连接池等待数。

GitHub 的首尔演练工作流使用这份 Dockerfile。通过隔离验收后，按镜像摘要记录候选版和对应 Git 提交。
