const express = require('express')
const router = express.Router()
const jwt = require('jsonwebtoken')
const { pool } = require('../utils/db')
const { JWT_SECRET } = require('../middleware/auth')

// GET /api/auth/check —— 检查当前用户是否为管理员
router.get('/check', async (req, res) => {
  try {
    const openid = req.headers['x-wx-openid']
    if (!openid) return res.json({ code: 0, isAdmin: false, message: '未获取到 openid' })

    const [[admin]] = await pool.execute('SELECT * FROM admins WHERE openid = ?', [openid])
    if (admin) {
      const token = jwt.sign(
        { openid, role: 'admin', adminName: admin.name || openid },
        JWT_SECRET, { expiresIn: '2h' }
      )
      res.json({ code: 0, isAdmin: true, openid, token })
    } else {
      res.json({ code: 0, isAdmin: false, openid })
    }
  } catch (err) {
    console.error('auth/check error:', err)
    res.status(500).json({ code: 500, message: '检查失败' })
  }
})

// POST /api/auth/wechat-login — 兼容旧版微信登录
router.post('/wechat-login', async (req, res) => {
  try {
    const { code } = req.body
    if (!code) return res.status(400).json({ code: 400, message: 'code 必填' })

    const appid = process.env.WX_APPID
    const secret = process.env.WX_SECRET
    const wxRes = await fetch(
      `https://api.weixin.qq.com/sns/jscode2session?appid=${appid}&secret=${secret}&js_code=${code}&grant_type=authorization_code`
    )
    const wxData = await wxRes.json()

    if (!wxData.openid) {
      return res.status(400).json({ code: 400, message: '微信登录失败: ' + (wxData.errmsg || '未知错误') })
    }

    const openid = wxData.openid
    const [[admin]] = await pool.execute('SELECT * FROM admins WHERE openid = ?', [openid])

    if (admin) {
      const token = jwt.sign(
        { openid, role: 'admin', adminName: admin.name || openid },
        JWT_SECRET, { expiresIn: '2h' }
      )
      res.json({ code: 0, isAdmin: true, openid, token })
    } else {
      res.json({ code: 0, isAdmin: false, openid })
    }
  } catch (err) {
    console.error('auth/wechat-login error:', err)
    res.status(500).json({ code: 500, message: '登录失败' })
  }
})

module.exports = router
