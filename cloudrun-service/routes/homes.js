const express = require('express')
const router = express.Router()
const { pool } = require('../utils/db')

// GET /api/homes — 所有校友之家列表
router.get('/', async (req, res) => {
  try {
    const [homes] = await pool.execute(
      'SELECT * FROM alumni_homes ORDER BY id'
    )

    // 为每个 home 填充 photos, services 数组
    const result = []
    for (const home of homes) {
      const [[{ cnt: photoCount }]] = await pool.execute(
        'SELECT COUNT(*) as cnt FROM home_photos WHERE home_id = ?', [home.id]
      )
      const [photos] = photoCount > 0
        ? await pool.execute('SELECT url FROM home_photos WHERE home_id = ? ORDER BY sort', [home.id])
        : [[{ url: null }]]

      const [services] = await pool.execute(
        'SELECT service FROM home_services WHERE home_id = ?', [home.id]
      )

      result.push({
        ...home,
        _id: String(home.id),
        dbId: String(home.id),
        photos: photos.filter(p => p.url).map(p => p.url),
        services: services.map(s => s.service)
      })
    }

    res.json({ code: 0, data: result })
  } catch (err) {
    console.error('GET /homes error:', err)
    res.status(500).json({ code: 500, message: '加载失败' })
  }
})

// GET /api/homes/:id — 单个详情
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) return res.status(400).json({ code: 400, message: 'id 无效' })

    const [[home]] = await pool.execute(
      'SELECT * FROM alumni_homes WHERE id = ?', [id]
    )
    if (!home) return res.status(404).json({ code: 404, message: '未找到' })

    const [photos] = await pool.execute(
      'SELECT url FROM home_photos WHERE home_id = ? ORDER BY sort', [id]
    )
    const [services] = await pool.execute(
      'SELECT service FROM home_services WHERE home_id = ?', [id]
    )

    res.json({
      code: 0,
      data: {
        ...home,
        _id: String(home.id),
        id: String(home.id),
        photos: photos.map(p => p.url),
        services: services.map(s => s.service)
      }
    })
  } catch (err) {
    console.error('GET /homes/:id error:', err)
    res.status(500).json({ code: 500, message: '加载失败' })
  }
})

module.exports = router
