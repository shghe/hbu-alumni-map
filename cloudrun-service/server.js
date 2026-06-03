process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
require('dotenv').config()
const express = require('express')
const COS = require('cos-nodejs-sdk-v5')
const crypto = require('crypto')
const https = require('https')

const homesRouter = require('./routes/homes')
const reviewsRouter = require('./routes/reviews')
const adminRouter = require('./routes/admin')
const authRouter = require('./routes/auth')
const { initDB } = require('./utils/db')
const { adminAuth } = require('./middleware/auth')

const app = express()
const PORT = process.env.PORT || 80
const BUCKET = process.env.COS_BUCKET || 'hbu-alumni-map-single-shanghai-1430752917'
const REGION = process.env.COS_REGION || 'ap-shanghai'
const cos = new COS({ SecretId: process.env.COS_SECRET_ID, SecretKey: process.env.COS_SECRET_KEY })

// ---- 内网文件代理 ----

// 下载：COS 内网拉取，分片返回（每片 ≤512KB）
app.get('/api/getImg', async (req, res) => {
  try {
    const { key, offset, size } = req.query
    if (!key) return res.status(400).end()
    const chunkSize = Math.min(parseInt(size, 10) || 524288, 786432)
    const start = parseInt(offset, 10) || 0
    const data = await new Promise((resolve, reject) => {
      cos.getObject({ Bucket: BUCKET, Region: REGION, Key: key }, (e, d) => { if (e) reject(e); else resolve(d) })
    })
    const buf = data.Body
    const total = buf.length
    const piece = buf.slice(start, start + chunkSize)
    res.json({ code: 0, data: piece.toString('base64'), total, offset: start, size: piece.length, mime: data.headers['content-type'] || 'image/jpeg' })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/getVideo', async (req, res) => {
  try {
    const { key, offset, size } = req.query
    if (!key) return res.status(400).end()
    const chunkSize = Math.min(parseInt(size, 10) || 524288, 786432)
    const start = parseInt(offset, 10) || 0
    const data = await new Promise((resolve, reject) => {
      cos.getObject({ Bucket: BUCKET, Region: REGION, Key: key }, (e, d) => { if (e) reject(e); else resolve(d) })
    })
    const buf = data.Body
    const total = buf.length
    const piece = buf.slice(start, start + chunkSize)
    res.json({ code: 0, data: piece.toString('base64'), total, offset: start, size: piece.length, mime: data.headers['content-type'] || 'video/mp4' })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// 上传：小程序 → callContainer → 云托管 → COS
app.post('/api/files/upload', express.raw({ type: '*/*', limit: '10mb' }), async (req, res) => {
  try {
    const key = req.query.key
    if (!key || !req.body || req.body.length === 0) return res.status(400).json({ error: 'key & body required' })
    await new Promise((resolve, reject) => {
      cos.putObject({ Bucket: BUCKET, Region: REGION, Key: key, Body: req.body }, (e, d) => { if (e) reject(e); else resolve(d) })
    })
    res.json({ code: 0, url: `https://${BUCKET}.cos.${REGION}.myqcloud.com/${key}` })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// 全局中间件
app.use(express.json({ limit: '10mb' }))
app.use((req, res, next) => { console.log(`${new Date().toISOString()} ${req.method} ${req.path}`); next() })

// 路由
app.use('/api/homes', homesRouter)
app.use('/api/reviews', reviewsRouter)
app.use('/api/auth', authRouter)
app.use('/api/admin', adminAuth, adminRouter)
app.use('/api/upload', adminAuth, require('./routes/upload'))

// 公开评论上传凭证
app.get('/api/review-sts', async (req, res) => {
  try {
    const count = Math.min(parseInt(req.query.count, 10) || 1, 6)
    const { getSTSCredentials } = require('./utils/cos')
    const sts = await getSTSCredentials(count)
    res.json({ code: 0, ...sts })
  } catch (err) { res.status(500).json({ code: 500, message: err.message }) }
})

app.get('/api/health', (req, res) => res.json({ ok: true }))
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ code: 500, message: '服务器错误' }) })

// 启动
async function migrateOldUrls() {
  const { pool } = require('./utils/db')
  for (const op of ['hbu-alumni-map-1430752917', 'hbu-alumni-map-single-1430752917']) {
    for (const t of ['home_photos', 'review_photos']) await pool.execute(`UPDATE ${t} SET url = REPLACE(url, '${op}', '${BUCKET}') WHERE url LIKE '%${op}%'`)
    for (const c of ['video', 'video_poster']) await pool.execute(`UPDATE alumni_homes SET ${c} = REPLACE(${c}, '${op}', '${BUCKET}') WHERE ${c} LIKE '%${op}%'`)
  }
  for (const t of ['home_photos', 'review_photos']) await pool.execute(`UPDATE ${t} SET url = REPLACE(url, 'ap-beijing', 'ap-shanghai') WHERE url LIKE '%ap-beijing%'`)
  for (const c of ['video', 'video_poster']) await pool.execute(`UPDATE alumni_homes SET ${c} = REPLACE(${c}, 'ap-beijing', 'ap-shanghai') WHERE ${c} LIKE '%ap-beijing%'`)
}

initDB().then(async () => { await migrateOldUrls(); app.listen(PORT, () => console.log(`API:${PORT}`)) })
  .catch(err => { console.error('DB:', err.message); app.listen(PORT, () => console.log(`API(noDB):${PORT}`)) })
