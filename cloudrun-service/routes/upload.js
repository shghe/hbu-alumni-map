const express = require('express')
const router = express.Router()

// 旧版 STS 入口已禁用；上传统一走 /api/media/upload/*。
router.get('/sts', async (req, res) => {
  res.status(410).json({ code: 410, message: 'STS 已禁用，请使用 /api/media/upload/* 内网中转上传' })
})

// 兼容旧路径，明确拒绝继续发放 COS 临时凭证。
router.get('/review-sts', async (req, res) => {
  res.status(410).json({ code: 410, message: 'STS 已禁用，请使用 /api/media/upload/* 内网中转上传' })
})

module.exports = router
