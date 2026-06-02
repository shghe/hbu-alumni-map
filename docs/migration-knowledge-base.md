# 微信小程序：云开发 → 云托管 + COS + MySQL 迁移全记录

> HBU校友之家地图 v2.0.0 生产版

---

## 一、最终架构

```
小程序
  │
  │ wx.cloud.callContainer (微信内网，免域名白名单，免ICP备案)
  │
  ▼
微信云托管 prod-d2gq9dsgy570dcb29
  │
  ├── alumni-api (Express + Node 18)
  │     ├── /api/homes       → 校友之家 CRUD
  │     ├── /api/reviews     → 评价系统
  │     ├── /api/auth        → 管理员认证 (x-wx-openid)
  │     ├── /api/admin       → 管理后台
  │     ├── /api/upload/sts  → 管理员上传凭证
  │     └── /api/review-sts  → 公开评论上传凭证
  │
  ├── MySQL 10.13.111.215
  │     ├── alumni_homes
  │     ├── home_photos
  │     ├── home_services
  │     ├── reviews
  │     ├── review_photos
  │     ├── admins
  │     └── admin_logs
  │
  └── 腾讯 COS hbu-alumni-map-1430752917 (ap-beijing)
        ├── homes/       (校友之家照片/视频/封面)
        └── reviews/     (评价照片)
```

---

## 二、关键技术决策

### 2.1 为什么用 callContainer 而不是 wx.request
- `wx.request` 需要域名加入小程序白名单
- 云托管测试域名 `*.sh.run.tcloudbase.com` 无法加入白名单
- 自定义域名需要 ICP 备案（2周+）
- `wx.cloud.callContainer` 走微信内网，**免域名白名单、免备案**

### 2.2 为什么不用云开发
- 云开发 NoSQL 数据库功能受限
- 云存储 `cloud://` URI 依赖微信 CDN
- 云函数冷启动慢
- 迁移到标准 MySQL + COS 更灵活

### 2.3 认证方案
- callContainer 自动注入 `x-wx-openid` 请求头
- 后端读取 header → 查 admins 表 → 返回 JWT
- 后续管理操作携带 JWT，或继续用 openid 验证

---

## 三、踩坑记录

### 坑1：callContainer SDK 注入提示 "skipped"
```
cloud sdk (build ts 1670494204239) injection skipped for sdk version 2.23.4
```
**原因**：DevTools 内置的云 SDK 编译于 2022年12月，与新基础库不完全兼容
**解决**：忽略此警告，`wx.cloud.callContainer` 实际上可用（控制台验证存在）
**基础库**：建议 2.23.0 ~ 2.25.4

### 坑2：callContainer 报 Invalid path (-601031)
**原因**：路径未加 `/api` 前缀，或 service 名传错
**解决**：`path: '/api' + path`，config 中加 `service: 'alumni-api'`

### 坑3：callContainer 冷启动超时 (102002)
**解决**：云托管服务设置 → 实例副本数最小值设为 1

### 坑4：云托管容器 HTTPS 请求自签证书
```
Error: self-signed certificate
```
**解决**：server.js 最顶部加 `process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'`

### 坑5：MySQL 建库失败 "Unknown database"
**原因**：连接池指定了不存在的 database，无法执行 CREATE DATABASE
**解决**：建库时用不指定 database 的独立连接

### 坑6：MySQL USE 命令用 execute() 报错
```
This command is not supported in the prepared statement protocol yet
```
**解决**：`USE database` 改用 `query()` 而非 `execute()`

### 坑7：MySQL 不支持 CREATE INDEX IF NOT EXISTS
**解决**：用 try-catch 包裹，忽略 "Duplicate key" 错误

### 坑8：COS SDK getSTS 不可用
```
cos.getSTS is not a function
```
**解决**：直接用腾讯云 STS API 获取临时密钥

### 坑9：STS API 需要 X-TC-Region 头
**解决**：请求头添加 `'X-TC-Region': 'ap-beijing'`

### 坑10：STS policy resource 格式
```
InvalidParameter.GrantOtherResource: cant grant other resource
```
**解决**：resource 设为 `['*']`

### 坑11：MySQL DECIMAL 返回字符串
**问题**：`wx.openLocation` 需要 number，MySQL 的 DECIMAL 列返回字符串
**解决**：`Number(home.latitude)`, `Number(home.longitude)`

### 坑12：COS 上传域名不在白名单
**解决**：小程序后台添加 uploadFile/downloadFile 合法域名：
`https://hbu-alumni-map-1430752917.cos.ap-beijing.myqcloud.com`

### 坑13：微信云托管 vs TCB CloudBase
- **微信云托管**：`cloud.weixin.qq.com`，CLI 是 `@wxcloud/cli`
- **TCB CloudBase**：`tcb.cloud.tencent.com`，CLI 是 `@cloudbase/cli`
- 两个平台不同，环境 ID 不互通

### 坑14：部署 ZIP 包含整个项目
**原因**：`@wxcloud/cli` 的 `--targetDir` 实际无效，始终上传当前目录
**解决**：`cd` 到目标目录后部署，或手动上传 ZIP

### 坑15：Node.js 26 环境下 CLI 上传报错
```
ERR_FR_MAX_BODY_LENGTH_EXCEEDED
```
**解决**：patch `follow-redirects` 包，maxBodyLength 改为 100MB，或加 `--detach` 参数

### 坑16：数据迁移脚本 OOM
**原因**：视频文件太大，容器内存不够
**解决**：分批迁移，每次处理少量文件。视频单独逐个迁移。

---

## 四、部署运维

### 4.1 部署方式
- 微信云托管控制台 → 手动上传 ZIP（最可靠）
- CLI：`wxcloud run:deploy --detach --noConfirm`

### 4.2 Dockerfile
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY . .
EXPOSE 80
CMD ["node", "server.js"]
```

### 4.3 环境变量 (.env)
```
WX_APPID=xxx
WX_SECRET=小程序AppSecret
COS_SECRET_ID=xxx
COS_SECRET_KEY=xxx
COS_BUCKET=xxx
COS_REGION=ap-beijing
MYSQL_HOST=10.13.111.215
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=xxx
MYSQL_DATABASE=hbu_alumni_map
JWT_SECRET=xxx
```
注：`dotenv` 包加载，需打包进 ZIP

### 4.4 数据库 7 张表
```sql
alumni_homes     -- 校友之家 (id, name, city, lat, lng, contact_name, ...)
home_photos      -- 照片 (home_id → alumni_homes.id)
home_services    -- 服务标签 (home_id → alumni_homes.id)
reviews          -- 评价 (home_id → alumni_homes.id)
review_photos    -- 评价照片 (review_id → reviews.id)
admins           -- 管理员 (openid)
admin_logs       -- 操作日志
```

### 4.5 COS 目录结构
```
hbu-alumni-map-1430752917/
  homes/          -- 校友之家照片、视频、封面
  reviews/        -- 评价照片
```
Bucket 权限：公有读私有写

---

## 五、前端关键代码

### 5.1 app.js
```javascript
App({
  globalData: { appName: 'HBU校友之家地图', adminToken: '' },
  onLaunch() { wx.cloud.init({ env: 'prod-d2gq9dsgy570dcb29' }) }
})
```

### 5.2 app.json
```json
{ "cloud": true }
```

### 5.3 api.js (callContainer 封装)
```javascript
const ENV = 'prod-d2gq9dsgy570dcb29'

function request(method, path, data) {
  return new Promise((resolve, reject) => {
    wx.cloud.callContainer({
      config: { env: ENV },
      path: '/api' + path,
      method,
      header: { 'Content-Type': 'application/json' },
      data: method !== 'GET' ? data : undefined,
      timeout: 15000,
      success: (res) => resolve(res.data),
      fail: reject
    })
  })
}
```

### 5.4 管理员认证 (admin/list/index.js)
```javascript
tryAutoLogin() {
  api.get('/auth/check').then((res) => {
    if (res.code === 0 && res.isAdmin) {
      getApp().globalData.adminToken = res.token
      this.setData({ authenticated: true })
      this.loadHomes()
    } else if (res.code === 0 && res.openid) {
      this.setData({ myOpenid: res.openid })
    }
  })
}
```

---

## 六、后端关键代码

### 6.1 管理员认证中间件
```javascript
async function adminAuth(req, res, next) {
  // JWT 认证
  // callContainer 自动注入的 x-wx-openid
  const wxOpenid = req.headers['x-wx-openid']
  if (wxOpenid) {
    const [[admin]] = await pool.execute('SELECT * FROM admins WHERE openid = ?', [wxOpenid])
    if (admin) { req.openid = wxOpenid; return next() }
  }
  return res.status(401).json({ code: 401, message: '无权限' })
}
```

### 6.2 COS STS 凭证生成
```javascript
// 直接用腾讯云 STS API，不依赖 COS SDK
const host = 'sts.tencentcloudapi.com'
const action = 'GetFederationToken'
// TC3-HMAC-SHA256 签名
// 请求头必须包含 X-TC-Region
```

### 6.3 MySQL 初始化
```javascript
// 1. 不指定 database 的连接建库
// 2. USE 命令用 query() 而非 execute()
// 3. CREATE INDEX 用 try-catch 包裹
```

---

## 七、数据迁移流水线

### 7.1 NoSQL → MySQL
- 从 cloud1 环境读取 alumni_homes, reviews, admins, admin_logs
- 写入 MySQL 对应表
- ID 映射：旧 _id (string) → 新 id (int)

### 7.2 cloud:// → COS
- 从云存储下载文件
- 上传到 COS 对应路径
- 更新 MySQL 中的 URL

### 7.3 分批迁移策略
- 照片：每次 3 张（避免 OOM）
- 视频：每次 1 个
- 封面：每次 1 个

---

## 八、上线清单

- [x] 云托管服务运行
- [x] MySQL 建表 + 数据迁移
- [x] COS 存储 + 文件迁移
- [x] callContainer 内网访问
- [x] 首页加载
- [x] 详情页
- [x] 评价提交
- [x] 管理后台 CRUD
- [x] COS 上传白名单
- [x] 云开发依赖清理
- [ ] 提交微信审核
