const express = require('express')
const router = express.Router()
const { pool } = require('../utils/db')
const { signUrls } = require('../utils/cos')

// GET /api/reviews?homeId=xxx — 某个校友之家的评价
router.get('/', async (req, res) => {
  try {
    const { homeId } = req.query
    if (!homeId) return res.status(400).json({ code: 400, message: 'homeId 必填' })

    const homeIdNum = parseInt(homeId, 10)
    if (isNaN(homeIdNum)) return res.status(400).json({ code: 400, message: 'homeId 无效' })

    const [reviews] = await pool.execute(
      'SELECT * FROM reviews WHERE home_id = ? ORDER BY created_at DESC', [homeIdNum]
    )

    const result = []
    for (const r of reviews) {
      const [photos] = await pool.execute(
        'SELECT url FROM review_photos WHERE review_id = ?', [r.id]
      )
      const photoUrls = photos.map(p => p.url)
      const signedPhotos = await signUrls(photoUrls)
      result.push({
        ...r,
        _id: String(r.id),
        homeId: String(r.home_id),
        home_id: undefined,
        avatar: r.nickname ? r.nickname.slice(0, 1) : '?',
        photos: signedPhotos
      })
    }

    res.json({ code: 0, data: result })
  } catch (err) {
    console.error('GET /reviews error:', err)
    res.status(500).json({ code: 500, message: '加载失败' })
  }
})

// POST /api/reviews — 评论功能已关闭
router.post('/', (req, res) => {
  res.status(410).json({ code: 410, message: '评论功能已关闭' })
})

module.exports = router
