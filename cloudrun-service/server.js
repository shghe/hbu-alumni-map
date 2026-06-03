process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
require('dotenv').config()
const express = require('express')

const homesRouter = require('./routes/homes')
const reviewsRouter = require('./routes/reviews')
const adminRouter = require('./routes/admin')
const authRouter = require('./routes/auth')
const mediaRouter = require('./routes/media')
const { initDB } = require('./utils/db')
const { adminAuth } = require('./middleware/auth')

const app = express()
const PORT = process.env.PORT || 80

app.use(express.json({ limit: '10mb' }))
app.use((req, res, next) => { console.log(`${new Date().toISOString()} ${req.method} ${req.path}`); next() })

app.use('/api/homes', homesRouter)
app.use('/api/reviews', reviewsRouter)
app.use('/api/auth', authRouter)
app.use('/api/media', mediaRouter)
app.use('/api/admin', adminAuth, adminRouter)
app.use('/api/upload', adminAuth, require('./routes/upload'))

app.get('/api/review-sts', async (req, res) => {
  res.status(410).json({ code: 410, message: 'STS 已禁用，请使用 /api/media/upload/* 内网中转上传' })
})

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }))
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ code: 500, message: '服务器错误' }) })

async function run() {
  try {
    await initDB()
    const { pool } = require('./utils/db')
    const B = process.env.COS_BUCKET || 'hbu-alumni-map-single-shanghai-1430752917'
    for (const op of ['hbu-alumni-map-1430752917', 'hbu-alumni-map-single-1430752917']) {
      for (const t of ['home_photos', 'review_photos']) await pool.execute(`UPDATE ${t} SET url = REPLACE(url, ?, ?) WHERE url LIKE ?`, [op, B, `%${op}%`])
      for (const c of ['video', 'video_poster']) await pool.execute(`UPDATE alumni_homes SET ${c} = REPLACE(${c}, ?, ?) WHERE ${c} LIKE ?`, [op, B, `%${op}%`])
    }
    for (const t of ['home_photos', 'review_photos']) await pool.execute(`UPDATE ${t} SET url = REPLACE(url, 'ap-beijing', 'ap-shanghai') WHERE url LIKE '%ap-beijing%'`)
    for (const c of ['video', 'video_poster']) await pool.execute(`UPDATE alumni_homes SET ${c} = REPLACE(${c}, 'ap-beijing', 'ap-shanghai') WHERE ${c} LIKE '%ap-beijing%'`)
    console.log('URL migration done')
  } catch (e) { console.log('Migration skipped:', e.message) }
  app.listen(PORT, () => console.log(`API:${PORT}`))
}
run()
