const jwt = require('jsonwebtoken')
const JWT_SECRET = process.env.JWT_SECRET || 'hbu-alumni-map-secret'

function adminAuth(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ code: 401, message: '未登录' })
  }
  try {
    const payload = jwt.verify(authHeader.slice(7), JWT_SECRET)
    if (payload.role !== 'admin') {
      return res.status(403).json({ code: 403, message: '无权限' })
    }
    req.openid = payload.openid
    req.adminName = payload.adminName || payload.openid
    next()
  } catch {
    return res.status(401).json({ code: 401, message: 'Token 无效或已过期' })
  }
}

module.exports = { adminAuth, JWT_SECRET }
