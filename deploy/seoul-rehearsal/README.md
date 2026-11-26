# 首尔隔离发布

这个工作流用于演练。它构建演练分支的镜像，发布到首尔本机的私有镜像库，然后在无外网、无公开端口的容器里启动新版。检查通过后，演练会模拟一次失败并切回固定的旧版，最后清理演练容器。两版都用模拟数据。

## 手动运行

工作流名是 `Seoul isolated manual release`。运行目标固定为 `codex/seoul-manual-release`，GitHub 的 `seoul-isolated-publish` 和 `seoul-isolated-deploy` 环境也只向这个分支提供凭据。

```sh
gh workflow run seoul-private-registry-rehearsal.yml \
  --repo HomuraCatMadoka/CUpedia --ref codex/seoul-manual-release
```

在运行记录中核对私有镜像发布、只读拉取、新版启动、故障模拟和旧版恢复。旧版镜像的摘要记录在首尔镜像库目录的 `isolated-baseline-digest`。

## 证书

镜像库只监听首尔服务器的 `127.0.0.1:5105`。根证书和签名密钥存放在服务器的 `/etc/cupedia-registry-tls/ca`，签名密钥只有 root 能读取。Docker 与 GitHub Actions 信任同一张根证书。

`cupedia-registry-tls-renew.timer` 每天香港时间 05:05 检查。服务证书有效期 90 天，剩下 21 天时换发。换发只重新加载镜像库自己的 Nginx，并用新连接验证证书和匿名拒绝。换发失败会切回前一张证书。根证书有自己的到期时间，应提前更换服务器与 GitHub Actions 的信任配置。

```sh
sudo systemctl list-timers --all cupedia-registry-tls-renew.timer
sudo /usr/bin/python3 -I /usr/local/lib/cupedia-registry/registry-tls.py check
```

## 账号和轮换

镜像发布、镜像只读、启动演练各用独立权限。镜像库发布账号可上传和读取，只读账号的上传请求会被拒绝。GitHub 的发布 SSH 密钥只能连接镜像库，演练 SSH 密钥只能启动固定演练入口。读镜像的密码留在首尔。

在演练结束后，使用 `registry-accounts.py stage-auth` 暂存新密码。将暂存的写入密码经受信任的 SSH 管道传给 `gh secret set SEOUL_TRIAL_REGISTRY_WRITER --env seoul-isolated-publish`。在首尔运行以下命令切换并检查账号，再手动运行一次演练。

```sh
root=/srv/cupedia-private-registry-rehearsal-20261126
sudo /usr/bin/python3 -I "$root/registry-accounts.py" \
  --compose-env "$root/images.env" activate-auth
sudo /usr/bin/python3 -I "$root/registry-accounts.py" check-auth
```

验证通过后运行 `finalize-auth`。若需恢复，使用同一镜像配置运行 `rollback-auth`，恢复之前的 GitHub 写入密码，检查后用 `discard-auth` 清理暂存。SSH 密钥用 `install-ssh` 分别换发，保持发布与演练密钥独立。
