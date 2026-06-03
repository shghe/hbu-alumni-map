process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
require('dotenv').config()
const express = require('express')

const homesRouter = require('./routes/homes')
const reviewsRouter = require('./routes/reviews')
const adminRouter = require('./routes/admin')
const authRouter = require('./routes/auth')
const uploadRouter = require('./routes/upload')
const { initDB } = require('./utils/db')
const { adminAuth } = require('./middleware/auth')

const app = express()
const PORT = process.env.PORT || 80

// ---- COS 内网代理（直接流式返回，单次 callContainer 搞定）----
const COS = require('cos-nodejs-sdk-v5')
const cosProxy = new COS({ SecretId: process.env.COS_SECRET_ID, SecretKey: process.env.COS_SECRET_KEY })
const COS_BUCKET = process.env.COS_BUCKET || 'hbu-alumni-map-single-shanghai-1430752917'
const COS_REGION = process.env.COS_REGION || 'ap-shanghai'

app.get('/api/getImg', (req, res) => {
  const key = req.query.key
  if (!key) return res.status(400).end()
  cosProxy.getObject({ Bucket: COS_BUCKET, Region: COS_REGION, Key: key }, (err, data) => {
    if (err) { console.error('getImg:', err.message); return res.status(500).end() }
    res.setHeader('Content-Type', data.headers['content-type'] || 'image/jpeg')
    data.Body.pipe(res)
  })
})

app.get('/api/getVideo', (req, res) => {
  const key = req.query.key
  if (!key) return res.status(400).end()
  cosProxy.getObject({ Bucket: COS_BUCKET, Region: COS_REGION, Key: key }, (err, data) => {
    if (err) { console.error('getVideo:', err.message); return res.status(500).end() }
    res.setHeader('Content-Type', data.headers['content-type'] || 'video/mp4')
    data.Body.pipe(res)
  })
})

// 全局中间件
app.use(express.json())
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`)
  next()
})

// 公开路由
app.use('/api/homes', homesRouter)
app.use('/api/reviews', reviewsRouter)
app.use('/api/auth', authRouter)

// 管理员路由
app.use('/api/admin', adminAuth, adminRouter)
// 公开评论上传凭证
const { getSTSCredentials } = require('./utils/cos')
app.get('/api/review-sts', async (req, res) => {
  try {
    const count = Math.min(parseInt(req.query.count, 10) || 1, 6)
    const stsData = await getSTSCredentials(count)
    res.json({ code: 0, ...stsData })
  } catch (err) {
    res.status(500).json({ code: 500, message: '获取上传凭证失败: ' + err.message })
  }
})
// 管理员上传凭证
app.use('/api/upload', adminAuth, uploadRouter)

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() })
})

app.use((err, req, res, next) => {
  console.error('Server error:', err)
  res.status(500).json({ code: 500, message: '服务器内部错误' })
})

// 启动时迁移旧桶 URL → 新桶
async function migrateOldUrls() {
  const { pool } = require('./utils/db')
  const newPrefix = process.env.COS_BUCKET || 'hbu-alumni-map-single-shanghai-1430752917'
  const oldPrefixes = ['hbu-alumni-map-1430752917', 'hbu-alumni-map-single-1430752917']
  try {
    for (const oldPrefix of oldPrefixes) {
      for (const table of ['home_photos', 'review_photos']) {
        // 替换桶名
        await pool.execute(`UPDATE ${table} SET url = REPLACE(url, '${oldPrefix}', '${newPrefix}') WHERE url LIKE '%${oldPrefix}%'`)
        // 替换地域 ap-beijing → ap-shanghai
      }
      for (const col of ['video', 'video_poster']) {
        await pool.execute(`UPDATE alumni_homes SET ${col} = REPLACE(${col}, '${oldPrefix}', '${newPrefix}') WHERE ${col} LIKE '%${oldPrefix}%'`)
      }
    }
    // 统一替换地域
    for (const table of ['home_photos', 'review_photos']) {
      await pool.execute(`UPDATE ${table} SET url = REPLACE(url, 'ap-beijing', 'ap-shanghai') WHERE url LIKE '%ap-beijing%'`)
    }
    for (const col of ['video', 'video_poster']) {
      await pool.execute(`UPDATE alumni_homes SET ${col} = REPLACE(${col}, 'ap-beijing', 'ap-shanghai') WHERE ${col} LIKE '%ap-beijing%'`)
    }
    console.log('URL migration done')
  } catch (e) {
    console.log('URL migration skipped:', e.message)
  }
}

// 启动
initDB().then(async () => {
  await migrateOldUrls()
  app.listen(PORT, () => console.log(`API server running on port ${PORT}`))
}).catch(err => {
  console.error('DB init failed:', err.message)
  app.listen(PORT, () => console.log(`API running on port ${PORT} (no DB)`))
})
