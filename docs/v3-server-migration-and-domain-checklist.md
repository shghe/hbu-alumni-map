# 3.0.0 轻量服务器迁移与域名上线清单

更新时间：2026-06-04

## 当前状态

3.0.0 已从微信云托管迁移到腾讯轻量服务器。

- 服务器：腾讯轻量服务器，北京区，`81.70.99.236`
- API 域名：`api.aluhomemap.top`
- 后端目录：`/home/ubuntu/hbu-alumni-map-api`
- 进程管理：PM2，进程名 `hbu-alumni-api`
- 反向代理：Nginx，当前 HTTP 80 可用
- 数据库：服务器本机 MySQL，库名 `hbu_alumni_map`
- 存储：腾讯 COS，北京桶 `hbu-alumni-map-single-1430752917`
- COS 访问域名：`hbu-alumni-map-single-1430752917.cos-internal.ap-beijing.tencentcos.cn`

已验证：

- `http://api.aluhomemap.top/api/health` 正常
- `/api/homes` 浏览器裸访问返回 `403`
- 带小程序客户端 header 后 `/api/homes/1` 正常
- `/api/media/diag` 显示 COS 解析到 `169.254.0.49`，`privateIp: true`，`headOk: true`
- 媒体走 `/api/media/stream?...&e=...&s=...` 签名代理路径

## 本次完成的主要改动

### 1. API 迁移到轻量服务器

小程序请求从 `wx.cloud.callContainer` 改为优先走 `wx.request`。

- 开发版/体验版：`http://api.aluhomemap.top`
- 正式版：`https://api.aluhomemap.top`
- 旧云托管配置保留为兜底，但当前主链路已走轻量服务器

相关文件：

- `utils/config.js`
- `utils/api.js`
- `app.js`

### 2. 数据迁移

已迁移到新 MySQL：

- 校友之家：12 条
- 评论：1 条
- 管理员：2 人，李赫、李姗姗

### 3. COS 内网访问

后端 COS SDK 已强制使用北京内网域名：

```text
hbu-alumni-map-single-1430752917.cos-internal.ap-beijing.tencentcos.cn
```

服务器 `.env` 中设置：

```text
COS_DOMAIN=hbu-alumni-map-single-1430752917.cos-internal.ap-beijing.tencentcos.cn
COS_INTERNAL_DOMAIN=hbu-alumni-map-single-1430752917.cos-internal.ap-beijing.tencentcos.cn
```

代码默认值也已改为内网域名，避免环境变量丢失时退回公网 COS 域名。

### 4. 媒体代理与缓存

图片和视频不再直连 COS，统一走后端代理：

```text
/api/media/stream?key=...&e=...&s=...
```

策略：

- 签名 URL 按 7 天窗口稳定
- 同一资源在 7 天内返回同一个 URL
- 有利于微信图片/视频缓存命中
- 裸 key 访问返回 `403`
- 服务端到 COS 走内网域名

### 5. 上传链路

上传不再使用 STS 直传，统一走后端中转分片上传：

```text
POST /api/media/upload/init
POST /api/media/upload/part
POST /api/media/upload/complete
POST /api/media/upload/abort
```

旧 STS 接口已返回 `410`。

### 6. 删除与编辑清理

后台删除和编辑时已做 COS 清理：

- 删除校友之家：删除之家照片、视频、视频封面、关联评论图片，并删除数据库记录
- 删除评论：删除评论图片，并删除数据库记录
- 编辑校友之家：删除不再引用的旧 COS 文件
- 入库时统一归一化为 `homes/...` 或 `reviews/...`，避免签名 URL 写进数据库

注意：COS 删除与数据库删除不是一个原子事务。若 COS 删除失败，接口会返回 `cosFailed` 数量，并在服务器日志记录。

### 7. API 防直开

JSON API 要求请求头：

```text
X-HBU-CLIENT: hbu-alumni-map-miniapp-v3
```

浏览器直接打开 `/api/homes` 会返回 `403`。

说明：这个 header 只能防止普通浏览器直开，不是强安全边界。真正敏感数据不要通过公开小程序接口下发。

### 8. 全局检查中已修复的问题

- 地图 marker 经纬度从字符串改为 `Number`
- 后端移除全局 TLS 校验关闭
- 微信登录请求恢复正常 TLS 校验
- 复制微信号/地址增加空值保护

## 当前仍需注意的问题

### 1. 正式版还不能上线，直到 HTTPS 配好

正式版小程序会请求：

```text
https://api.aluhomemap.top
```

当前 HTTPS 还未签发成功，原因是外部验证访问到 DNSPod 拦截页。等 ICP 备案/域名审核通过后再配置 HTTPS。

### 2. 上传失败可能留下 COS 孤儿文件

当前上传流程是先上传 COS，再写数据库。如果上传成功但保存数据库失败，已上传文件可能暂时留在 COS 中。

后续可增加“孤儿文件清理任务”，按上传时间扫描未入库文件并删除。

### 3. 大视频上传仍有内存压力

小程序端会先把整个文件读成 base64，再分片上传。视频过大时可能慢或失败。

后续可限制视频大小，或改成更细的文件流式读取方案。

### 4. 评论上传缺少限流

评论图片上传允许普通小程序用户使用。建议后续增加：

- 单用户上传频率限制
- 单文件大小限制
- 每日总量限制

## 域名审核/备案通过后要做的工作

### 1. 确认 DNS 不再被拦截

在本机或服务器检查：

```bash
curl -I http://api.aluhomemap.top/api/health
```

预期返回后端响应，而不是 DNSPod 拦截页。

### 2. 签发 HTTPS 证书

服务器已安装 certbot。备案通过后执行：

```bash
sudo certbot --nginx -d api.aluhomemap.top --non-interactive --agree-tos --register-unsafely-without-email --redirect
```

检查 Nginx：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

验证 HTTPS：

```bash
curl -I https://api.aluhomemap.top/api/health
```

预期：

```text
HTTP/2 200
```

或：

```text
HTTP/1.1 200 OK
```

### 3. 微信公众平台配置合法域名

微信公众平台：

```text
开发管理 -> 开发设置 -> 服务器域名
```

添加：

```text
request合法域名：https://api.aluhomemap.top
downloadFile合法域名：https://api.aluhomemap.top
uploadFile合法域名：https://api.aluhomemap.top
```

当前小程序使用 `wx.request` 调 API，图片/视频通过 HTTPS 代理 URL 加载，因此至少需要配置 `request` 和 `downloadFile`；`uploadFile` 建议一并配置，便于后续兼容。

### 4. 小程序代码

当前代码已经按环境自动切换：

```js
const API_BASE_URL = getEnvVersion() === 'release' ? HTTPS_API_BASE_URL : HTTP_API_BASE_URL
```

正式版会自动走：

```text
https://api.aluhomemap.top
```

开发版/体验版当前仍走：

```text
http://api.aluhomemap.top
```

如果希望体验版也走 HTTPS，可以把 `utils/config.js` 中的 `HTTP_API_BASE_URL` 也改为 `https://api.aluhomemap.top`，或者调整环境判断逻辑。

### 5. 重新编译与上传

域名和 HTTPS 完成后：

1. 微信开发者工具重新编译
2. 确认接口请求为 `https://api.aluhomemap.top`
3. 上传小程序版本
4. 到微信公众平台提交审核

### 6. 上线前验证清单

#### API 防直开

```bash
curl -s -o /dev/null -w '%{http_code}' https://api.aluhomemap.top/api/homes
```

预期：

```text
403
```

#### 小程序 header 访问正常

```bash
curl -s -H 'X-HBU-CLIENT: hbu-alumni-map-miniapp-v3' https://api.aluhomemap.top/api/homes/1
```

预期：

```json
{"code":0,"data":{...}}
```

#### COS 内网诊断

```bash
curl -s -H 'X-HBU-CLIENT: hbu-alumni-map-miniapp-v3' 'https://api.aluhomemap.top/api/media/diag?key=homes/1778482855190_f260o0ct2e9.jpg'
```

预期包含：

```json
{
  "host": "hbu-alumni-map-single-1430752917.cos-internal.ap-beijing.tencentcos.cn",
  "privateIp": true,
  "headOk": true
}
```

#### 签名媒体可访问

从 `/api/homes/1` 返回中复制一个 `/api/media/stream?...` 地址，然后验证：

```bash
curl -I 'https://api.aluhomemap.top/api/media/stream?...'
```

预期：

```text
HTTP/1.1 200 OK
```

或带 Range 时：

```text
HTTP/1.1 206 Partial Content
```

## 常用运维命令

登录服务器：

```bash
ssh -i /Users/lihe/Documents/个人文件/开发/hbu_alumni_map_tcserver.pem ubuntu@81.70.99.236
```

查看 API 状态：

```bash
pm2 status hbu-alumni-api
```

重启 API：

```bash
pm2 restart hbu-alumni-api --update-env
```

查看日志：

```bash
pm2 logs hbu-alumni-api
```

查看 Nginx 配置：

```bash
sudo nginx -T
```

测试 Nginx 配置：

```bash
sudo nginx -t
```

## 回滚思路

如果 HTTPS 配置后接口异常：

1. 先检查 PM2 是否在线
2. 再检查 Nginx 是否反代到 `127.0.0.1:3000`
3. 再检查证书和 443 监听
4. 必要时临时恢复 HTTP 开发测试

当前代码中开发版仍保留 HTTP 地址，可继续用开发者工具排查。
