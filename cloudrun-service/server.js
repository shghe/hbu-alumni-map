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
const PUBLIC_CLIENT_KEY = process.env.PUBLIC_CLIENT_KEY || 'hbu-alumni-map-miniapp-v3'

app.use(express.json({ limit: '10mb' }))
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range, X-WX-SERVICE, X-HBU-CLIENT')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,HEAD,OPTIONS')
  if (req.method === 'OPTIONS') return res.status(204).end()
  next()
})
app.use((req, res, next) => { console.log(`${new Date().toISOString()} ${req.method} ${req.path}`); next() })
app.use((req, res, next) => {
  if (req.path === '/api/health' || req.path.startsWith('/api/media/stream')) return next()
  if (req.headers['x-hbu-client'] === PUBLIC_CLIENT_KEY) return next()
  return res.status(403).json({ code: 403, message: 'forbidden' })
})

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
  } catch (e) { console.log('Database init skipped:', e.message) }
  app.listen(PORT, () => console.log(`API:${PORT}`))
}
run()
