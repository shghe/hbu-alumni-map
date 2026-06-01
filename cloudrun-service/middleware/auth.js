const jwt = require('jsonwebtoken')
const { pool } = require('../utils/db')
const JWT_SECRET = process.env.JWT_SECRET || 'hbu-alumni-jwt-2024-secure'

async function adminAuth(req, res, next) {
  // 方式1：JWT token（兼容旧逻辑）
  const authHeader = req.headers.authorization
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(authHeader.slice(7), JWT_SECRET)
      if (payload.role === 'admin') {
        req.openid = payload.openid
        req.adminName = payload.adminName || payload.openid
        return next()
      }
    } catch {}
  }

  // 方式2：云托管自动注入的 openid
  const wxOpenid = req.headers['x-wx-openid']
  if (wxOpenid) {
    try {
      const [[admin]] = await pool.execute('SELECT * FROM admins WHERE openid = ?', [wxOpenid])
      if (admin) {
        req.openid = wxOpenid
        req.adminName = admin.name || wxOpenid
        return next()
      }
    } catch {}
  }

  return res.status(401).json({ code: 401, message: '无权限' })
}

module.exports = { adminAuth, JWT_SECRET }
