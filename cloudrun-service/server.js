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

// 启动
initDB().then(() => {
  app.listen(PORT, () => console.log(`API server running on port ${PORT}`))
}).catch(err => {
  console.error('DB init failed:', err.message)
  app.listen(PORT, () => console.log(`API running on port ${PORT} (no DB)`))
})
