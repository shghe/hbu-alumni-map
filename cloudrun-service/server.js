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

// ---- COS 内网代理端点（消灭外网下行流量）----
const COS = require('cos-nodejs-sdk-v5')
const cosProxy = new COS({ SecretId: process.env.COS_SECRET_ID, SecretKey: process.env.COS_SECRET_KEY })

const COS_BUCKET = process.env.COS_BUCKET || 'hbu-alumni-map-single-shanghai-1430752917'
const COS_REGION = process.env.COS_REGION || 'ap-shanghai'
const COS_INTERNAL = `${COS_BUCKET}.cos.${COS_REGION}.internal.tencentcloud.com`

// 图片代理
app.get('/api/getImg', (req, res) => {
  const key = req.query.key
  if (!key) return res.status(400).end()
  cosProxy.getObject({ Bucket: COS_BUCKET, Region: COS_REGION, Key: key }, (err, data) => {
    if (err) { console.error('getImg:', err.message, 'key:', key); return res.status(500).end() }
    res.setHeader('Content-Type', data.headers['content-type'] || 'image/jpeg')
    res.setHeader('Cache-Control', 'public, max-age=86400')
    data.Body.on('error', () => { try { res.end() } catch {} })
    data.Body.pipe(res)
  })
})

// 视频代理
app.get('/api/getVideo', (req, res) => {
  const key = req.query.key
  if (!key) return res.status(400).end()
  cosProxy.getObject({ Bucket: COS_BUCKET, Region: COS_REGION, Key: key }, (err, data) => {
    if (err) { console.error('getVideo:', err.message, 'key:', key); return res.status(500).end() }
    res.setHeader('Content-Type', data.headers['content-type'] || 'video/mp4')
    res.setHeader('Accept-Ranges', 'bytes')
    data.Body.on('error', () => { try { res.end() } catch {} })
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

// URL 迁移：旧桶 → 新桶（一次性）
app.get('/api/migrate-urls', async (req, res) => {
  try {
    const { pool } = require('./utils/db')
    const oldPrefix = 'hbu-alumni-map-1430752917'
    const newPrefix = 'hbu-alumni-map-single-1430752917'
    const results = {}

    for (const table of ['home_photos', 'review_photos']) {
      const [rows] = await pool.execute(`SELECT id, url FROM ${table} WHERE url LIKE '%${oldPrefix}%'`)
      for (const row of rows) {
        const newUrl = row.url.replace(oldPrefix, newPrefix)
        await pool.execute(`UPDATE ${table} SET url = ? WHERE id = ?`, [newUrl, row.id])
      }
      results[table] = rows.length
    }

    for (const col of ['video', 'video_poster']) {
      const [rows] = await pool.execute(`SELECT id, ${col} FROM alumni_homes WHERE ${col} LIKE '%${oldPrefix}%'`)
      for (const row of rows) {
        const newUrl = row[col].replace(oldPrefix, newPrefix)
        await pool.execute(`UPDATE alumni_homes SET ${col} = ? WHERE id = ?`, [newUrl, row.id])
      }
      results[col] = rows.length
    }

    res.json({ ok: true, message: 'URL 迁移完成', results })
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message })
  }
})

// 视频迁移（一次性，每次1个）
app.get('/api/migrate-posters', async (req, res) => {
  try {
    const { migrateNextPoster } = require('./scripts/migrate-videos')
    const report = await migrateNextPoster()
    res.json({ ok: true, ...report })
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message })
  }
})

app.get('/api/migrate-videos', adminAuth, async (req, res) => {
  try {
    const { migrateNextVideo } = require('./scripts/migrate-videos')
    const report = await migrateNextVideo()
    res.json({ ok: true, ...report })
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message })
  }
})

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
        await pool.execute(`UPDATE ${table} SET url = REPLACE(url, '${oldPrefix}', '${newPrefix}') WHERE url LIKE '%${oldPrefix}%'`)
      }
      for (const col of ['video', 'video_poster']) {
        await pool.execute(`UPDATE alumni_homes SET ${col} = REPLACE(${col}, '${oldPrefix}', '${newPrefix}') WHERE ${col} LIKE '%${oldPrefix}%'`)
      }
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
