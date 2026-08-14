const jwt = require('jsonwebtoken')
const JWT_SECRET = process.env.JWT_SECRET

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET 环境变量未配置，服务拒绝启动')
}

async function adminAuth(req, res, next) {
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

  return res.status(401).json({ code: 401, message: '无权限' })
}

module.exports = { adminAuth, JWT_SECRET }
