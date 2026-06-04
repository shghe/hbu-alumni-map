const express = require('express')
const router = express.Router()
const { pool } = require('../utils/db')
const { signUrls, normalizeCosUrl } = require('../utils/cos')
const { validateReviewData } = require('../utils/validator')

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

// POST /api/reviews — 提交评价
router.post('/', async (req, res) => {
  try {
    const data = req.body
    const errors = validateReviewData(data)
    if (errors.length) return res.status(400).json({ code: 400, message: errors.join('; ') })

    const homeId = parseInt(data.homeId, 10)

    const [[home]] = await pool.execute('SELECT id FROM alumni_homes WHERE id = ?', [homeId])
    if (!home) return res.status(400).json({ code: 400, message: '校友之家不存在' })

    const [result] = await pool.execute(
      'INSERT INTO reviews (home_id, nickname, rating, content) VALUES (?, ?, ?, ?)',
      [homeId, data.nickname.trim(), data.rating, data.content.trim()]
    )
    const reviewId = result.insertId

    const photos = [...new Set((data.photos || []).map(url => normalizeCosUrl(url)).filter(Boolean))]
    if (photos.length > 0) {
      const values = photos.map(url => [reviewId, url])
      await pool.query('INSERT INTO review_photos (review_id, url) VALUES ?', [values])
    }

    res.json({ code: 0, id: String(reviewId) })
  } catch (err) {
    console.error('POST /reviews error:', err)
    res.status(500).json({ code: 500, message: '提交失败' })
  }
})

module.exports = router
