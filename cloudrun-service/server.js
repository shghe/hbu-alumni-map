process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
require('dotenv').config()
const express = require('express')
const COS = require('cos-nodejs-sdk-v5')
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
const mediaRouter = require('./routes/media')
const cos = new COS({ SecretId: process.env.COS_SECRET_ID, SecretKey: process.env.COS_SECRET_KEY })

// 全局中间件
app.use(express.json({ limit: '10mb' }))
app.use((req, res, next) => { console.log(`${new Date().toISOString()} ${req.method} ${req.path}`); next() })

// 路由
app.use('/api', mediaRouter)
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
