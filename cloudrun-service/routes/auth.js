const express = require('express')
const router = express.Router()
const jwt = require('jsonwebtoken')
const { pool } = require('../utils/db')
const { JWT_SECRET } = require('../middleware/auth')

// GET /api/auth/check — callContainer 自动注入 openid
router.get('/check', async (req, res) => {
  try {
    const openid = req.headers['x-wx-openid']
    if (!openid) return res.json({ code: 0, isAdmin: false, message: '未获取到 openid' })

    const [[admin]] = await pool.execute('SELECT * FROM admins WHERE openid = ?', [openid])
    if (admin) {
      const token = jwt.sign({ openid, role: 'admin', adminName: admin.name || openid }, JWT_SECRET, { expiresIn: '2h' })
      return res.json({ code: 0, isAdmin: true, openid, token })
    }
    return res.json({ code: 0, isAdmin: false, openid })
  } catch (err) {
    return res.status(500).json({ code: 500, message: err.message })
  }
})

// POST /api/auth/wechat-login
router.post('/wechat-login', async (req, res) => {
  try {
    const { code } = req.body
    if (!code) return res.status(400).json({ code: 400, message: 'code 必填' })

    const appid = process.env.WX_APPID
    const secret = process.env.WX_SECRET
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${appid}&secret=${secret}&js_code=${code}&grant_type=authorization_code`

    // 用原生 https 模块（兼容性更好）
    const https = require('https')
    const wxData = await new Promise((resolve, reject) => {
      https.get(url, { rejectUnauthorized: false }, (resp) => {
        let body = ''
        resp.on('data', c => body += c)
        resp.on('end', () => {
          try { resolve(JSON.parse(body)) }
          catch { reject(new Error('微信返回解析失败: ' + body.substring(0, 100))) }
        })
      }).on('error', (e) => reject(new Error('网络请求失败: ' + e.message)))
    })

    if (!wxData.openid) {
      return res.status(400).json({ code: 400, message: '微信登录失败: ' + (wxData.errmsg || JSON.stringify(wxData)) })
    }

    const openid = wxData.openid
    const [[admin]] = await pool.execute('SELECT * FROM admins WHERE openid = ?', [openid])

    if (admin) {
      const token = jwt.sign(
        { openid, role: 'admin', adminName: admin.name || openid },
        JWT_SECRET, { expiresIn: '2h' }
      )
      return res.json({ code: 0, isAdmin: true, openid, token })
    } else {
      return res.json({ code: 0, isAdmin: false, openid })
    }
  } catch (err) {
    console.error('auth/wechat-login error:', err)
    return res.status(500).json({ code: 500, message: '登录失败: ' + err.message })
  }
})

module.exports = router
