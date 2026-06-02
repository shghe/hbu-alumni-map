const express = require('express')
const router = express.Router()
const { getSTSCredentials } = require('../utils/cos')

// GET /api/upload/sts?count=N — 管理员上传凭证
router.get('/sts', async (req, res) => {
  try {
    const count = parseInt(req.query.count, 10) || 1
    const stsData = await getSTSCredentials(Math.min(count, 20))
    res.json({ code: 0, ...stsData })
  } catch (err) {
    console.error('GET /upload/sts error:', err)
    res.status(500).json({ code: 500, message: '获取上传凭证失败: ' + err.message })
  }
})

// GET /api/review-sts?count=N — 公开评论上传凭证
router.get('/review-sts', async (req, res) => {
  try {
    const count = parseInt(req.query.count, 10) || 1
    const stsData = await getSTSCredentials(Math.min(count, 6))
    res.json({ code: 0, ...stsData })
  } catch (err) {
    console.error('GET /upload/review-sts error:', err)
    res.status(500).json({ code: 500, message: '获取上传凭证失败: ' + err.message })
  }
})

module.exports = router
