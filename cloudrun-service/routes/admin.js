const express = require('express')
const router = express.Router()
const { pool } = require('../utils/db')
const { validateHomeData } = require('../utils/validator')
const { signUrls, normalizeCosUrl, deleteFile } = require('../utils/cos')

function mediaKey(value) {
  return normalizeCosUrl(value || '')
}

function mediaKeys(values) {
  return [...new Set((values || []).map(mediaKey).filter(Boolean))]
}

async function deleteCosFiles(values) {
  const failed = []
  for (const key of mediaKeys(values)) {
    try {
      await deleteFile(key)
    } catch (err) {
      failed.push({ key, message: err.message })
    }
  }
  if (failed.length) console.error('COS 删除失败:', failed)
  return failed
}

// ---------- 辅助函数：写操作日志 ----------
async function logAction(openid, adminName, action, detail) {
  try {
    await pool.execute(
      'INSERT INTO admin_logs (openid, admin_name, action, detail) VALUES (?, ?, ?, ?)',
      [openid, adminName, action, JSON.stringify(detail)]
    )
  } catch (e) {
    console.error('写日志失败', e)
  }
}

// ---------- 校友之家 CRUD ----------

// POST /api/admin/homes — 添加
router.post('/homes', async (req, res) => {
  try {
    const data = req.body
    const errors = validateHomeData(data, false)
    if (errors.length) return res.status(400).json({ code: 400, message: errors.join('; ') })
    const photos = mediaKeys(data.photos || [])
    const video = mediaKey(data.video) || null
    const videoPoster = mediaKey(data.videoPoster) || null

    const [result] = await pool.execute(
      `INSERT INTO alumni_homes (name, city, latitude, longitude, address, contact_name, phone, wechat, hours, description, video, video_poster)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.name, data.city, data.latitude, data.longitude,
       data.address || null, data.contactName || null, data.phone || null, data.wechat || null,
       data.hours || null, data.description || null, video, videoPoster]
    )
    const homeId = result.insertId

    // 插入 photos
    if (photos.length > 0) {
      const values = photos.map((url, i) => [homeId, url, i])
      await pool.query('INSERT INTO home_photos (home_id, url, sort) VALUES ?', [values])
    }

    // 插入 services
    if (data.services && data.services.length > 0) {
      const values = data.services.map(s => [homeId, s])
      await pool.query('INSERT INTO home_services (home_id, service) VALUES ?', [values])
    }

    await logAction(req.openid, req.adminName, 'add', { homeId, name: data.name, city: data.city })
    res.json({ code: 0, id: String(homeId) })
  } catch (err) {
    console.error('POST /admin/homes error:', err)
    res.status(500).json({ code: 500, message: '添加失败' })
  }
})

// PUT /api/admin/homes/:id — 更新
router.put('/homes/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) return res.status(400).json({ code: 400, message: 'id 无效' })

    const data = req.body
    const errors = validateHomeData({ ...data, id }, true)
    if (errors.length) return res.status(400).json({ code: 400, message: errors.join('; ') })
    const photos = mediaKeys(data.photos || [])
    const video = mediaKey(data.video) || null
    const videoPoster = mediaKey(data.videoPoster) || null

    // 收集旧文件，用于清理 COS
    const [[oldHome]] = await pool.execute('SELECT video, video_poster FROM alumni_homes WHERE id = ?', [id])
    if (!oldHome) return res.status(404).json({ code: 404, message: '未找到' })
    const [oldPhotos] = await pool.execute('SELECT url FROM home_photos WHERE home_id = ?', [id])
    const oldUrls = mediaKeys([...oldPhotos.map(p => p.url), oldHome.video, oldHome.video_poster])
    const newUrls = mediaKeys([...photos, video, videoPoster])

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      await conn.execute(
        `UPDATE alumni_homes SET name=?, city=?, latitude=?, longitude=?, address=?, contact_name=?, phone=?, wechat=?, hours=?, description=?, video=?, video_poster=?
         WHERE id=?`,
        [data.name, data.city, data.latitude, data.longitude,
         data.address || null, data.contactName || null, data.phone || null, data.wechat || null,
         data.hours || null, data.description || null, video, videoPoster,
         id]
      )

      // 重建 photos
      await conn.execute('DELETE FROM home_photos WHERE home_id = ?', [id])
      if (photos.length > 0) {
        const values = photos.map((url, i) => [id, url, i])
        await conn.query('INSERT INTO home_photos (home_id, url, sort) VALUES ?', [values])
      }

      // 重建 services
      await conn.execute('DELETE FROM home_services WHERE home_id = ?', [id])
      if (data.services && data.services.length > 0) {
        const values = data.services.map(s => [id, s])
        await conn.query('INSERT INTO home_services (home_id, service) VALUES ?', [values])
      }
      await conn.commit()
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }

    // 数据库提交成功后再删除不再引用的 COS 文件
    await deleteCosFiles(oldUrls.filter(url => !newUrls.includes(url)))

    await logAction(req.openid, req.adminName, 'update', { homeId: id, name: data.name, city: data.city })
    res.json({ code: 0 })
  } catch (err) {
    console.error('PUT /admin/homes/:id error:', err)
    res.status(500).json({ code: 500, message: '更新失败' })
  }
})

// DELETE /api/admin/homes/:id — 删除（级联删除评价和照片）
router.delete('/homes/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) return res.status(400).json({ code: 400, message: 'id 无效' })

    // 收集所有 COS 文件
    const [[home]] = await pool.execute('SELECT name, video, video_poster FROM alumni_homes WHERE id = ?', [id])
    if (!home) return res.status(404).json({ code: 404, message: '未找到' })
    const [photos] = await pool.execute('SELECT url FROM home_photos WHERE home_id = ?', [id])
    const [reviewPhotos] = await pool.execute(
      'SELECT rp.url FROM review_photos rp JOIN reviews r ON rp.review_id = r.id WHERE r.home_id = ?', [id]
    )

    const conn = await pool.getConnection()
    let reviewCount = 0
    try {
      await conn.beginTransaction()
      const [[{ cnt }]] = await conn.execute('SELECT COUNT(*) as cnt FROM reviews WHERE home_id = ?', [id])
      reviewCount = cnt
      await conn.execute('DELETE FROM alumni_homes WHERE id = ?', [id])
      await conn.commit()
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }

    // 数据库删除成功后再清理 COS，失败只记录，避免误删文件
    const cosFailures = await deleteCosFiles([...photos.map(p => p.url), ...reviewPhotos.map(p => p.url), home.video, home.video_poster])

    await logAction(req.openid, req.adminName, 'delete', { homeId: id, name: home.name || '', deletedReviews: reviewCount })
    res.json({ code: 0, deletedReviews: reviewCount, cosFailed: cosFailures.length })
  } catch (err) {
    console.error('DELETE /admin/homes/:id error:', err)
    res.status(500).json({ code: 500, message: '删除失败' })
  }
})

// ---------- 评价管理 ----------

// GET /api/admin/reviews — 所有评价
router.get('/reviews', async (req, res) => {
  try {
    const [reviews] = await pool.execute(
      `SELECT r.*, h.name as home_name
       FROM reviews r
       LEFT JOIN alumni_homes h ON r.home_id = h.id
       ORDER BY r.created_at DESC`
    )

    const result = []
    for (const r of reviews) {
      const [photos] = await pool.execute('SELECT url FROM review_photos WHERE review_id = ?', [r.id])
      const signedPhotos = await signUrls(photos.map(p => p.url))
      result.push({
        ...r,
        _id: String(r.id),
        homeId: String(r.home_id),
        home_id: undefined,
        homeName: r.home_name || '已删除',
        home_name: undefined,
        photos: signedPhotos,
        createTime: r.created_at
      })
    }

    res.json({ code: 0, data: result })
  } catch (err) {
    console.error('GET /admin/reviews error:', err)
    res.status(500).json({ code: 500, message: '加载失败' })
  }
})

// DELETE /api/admin/reviews/:id — 删除单条评价
router.delete('/reviews/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) return res.status(400).json({ code: 400, message: 'id 无效' })

    const [[review]] = await pool.execute('SELECT * FROM reviews WHERE id = ?', [id])
    if (!review) return res.status(404).json({ code: 404, message: '未找到' })
    const reviewInfo = review ? { nickname: review.nickname, homeId: String(review.home_id) } : {}

    const [photos] = await pool.execute('SELECT url FROM review_photos WHERE review_id = ?', [id])
    const cosFailures = await deleteCosFiles(photos.map(p => p.url))

    await pool.execute('DELETE FROM reviews WHERE id = ?', [id])

    await logAction(req.openid, req.adminName, 'deleteReview', { reviewId: id, ...reviewInfo })
    res.json({ code: 0, cosFailed: cosFailures.length })
  } catch (err) {
    console.error('DELETE /admin/reviews/:id error:', err)
    res.status(500).json({ code: 500, message: '删除失败' })
  }
})

// ---------- 操作日志 ----------

// GET /api/admin/logs — 操作日志
router.get('/logs', async (req, res) => {
  try {
    const [logs] = await pool.execute(
      'SELECT * FROM admin_logs ORDER BY created_at DESC LIMIT 100'
    )
    const data = logs.map(l => ({
      ...l,
      _id: String(l.id),
      createTime: l.created_at,
      adminName: l.admin_name,
      admin_name: undefined,
      created_at: undefined
    }))
    res.json({ code: 0, data })
  } catch (err) {
    console.error('GET /admin/logs error:', err)
    res.status(500).json({ code: 500, message: '加载失败' })
  }
})

module.exports = router
