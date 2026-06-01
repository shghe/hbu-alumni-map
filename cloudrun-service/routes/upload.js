const express = require('express')
const router = express.Router()
const { getSTSCredentials } = require('../utils/cos')

// GET /api/upload/sts?count=N — 获取 COS 上传临时凭证
router.get('/sts', async (req, res) => {
  try {
    const count = parseInt(req.query.count, 10) || 1
    const stsData = await getSTSCredentials(Math.min(count, 20))
    res.json({ code: 0, ...stsData })
  } catch (err) {
    console.error('GET /upload/sts error:', err)
    res.status(500).json({ code: 500, message: '获取上传凭证失败' })
  }
})

module.exports = router
