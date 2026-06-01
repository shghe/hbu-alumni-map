require('dotenv').config()
const express = require('express')
const jwt = require('jsonwebtoken')

const homesRouter = require('./routes/homes')
const reviewsRouter = require('./routes/reviews')
const adminRouter = require('./routes/admin')
const authRouter = require('./routes/auth')
const uploadRouter = require('./routes/upload')

const { initDB } = require('./utils/db')

const app = express()
const PORT = process.env.PORT || 80

// ---------- 照片迁移 cloud:// → COS https://（每次处理3个文件）----------
app.get('/api/migrate-photos', async (req, res) => {
  try {
    const { migrateNextBatch } = require('./scripts/migrate-photos')
    const report = await migrateNextBatch(3)
    res.json({ ok: true, ...report })
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message })
  }
})

// ---------- 数据迁移（一次性） ----------
app.get('/api/migrate', async (req, res) => {
  try {
    const { runMigration } = require('./scripts/migrate-data')
    await runMigration()
    res.json({ ok: true, message: '数据迁移完成' })
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message, stack: err.stack?.split('\n').slice(0, 5) })
  }
})

// ---------- 全局中间件 ----------
app.use(express.json())

// 请求日志
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`)
  next()
})

// ---------- 公开路由 ----------
app.use('/api/homes', homesRouter)
app.use('/api/reviews', reviewsRouter)
app.use('/api/auth', authRouter)

// ---------- 需认证路由 ----------
const { adminAuth } = require('./middleware/auth')
app.use('/api/admin', adminAuth, adminRouter)
app.use('/api/upload', adminAuth, uploadRouter)

// ---------- 健康检查 ----------
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() })
})

// ---------- 错误处理 ----------
app.use((err, req, res, next) => {
  console.error('Server error:', err)
  res.status(500).json({ code: 500, message: '服务器内部错误' })
})

// ---------- 启动 ----------
initDB().then(() => {
  console.log('Database initialized')
  app.listen(PORT, () => {
    console.log(`API server running on port ${PORT}`)
  })
}).catch(err => {
  console.error('Database init failed:', err.message)
  // 即使数据库初始化失败也启动服务（health 检查仍可用）
  app.listen(PORT, () => {
    console.log(`API server running on port ${PORT} (without DB)`)
  })
})
