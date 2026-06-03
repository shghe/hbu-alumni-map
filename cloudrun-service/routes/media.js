const express = require('express')
const router = express.Router()
const COS = require('cos-nodejs-sdk-v5')
const BUCKET = process.env.COS_BUCKET || 'hbu-alumni-map-single-shanghai-1430752917'
const REGION = process.env.COS_REGION || 'ap-shanghai'
const cos = new COS({ SecretId: process.env.COS_SECRET_ID, SecretKey: process.env.COS_SECRET_KEY })

router.get('/getImg', async (req, res) => {
  try {
    const { key, offset, size } = req.query
    if (!key) return res.status(400).end()
    const chunkSize = Math.min(parseInt(size, 10) || 524288, 786432)
    const start = parseInt(offset, 10) || 0
    const data = await new Promise((resolve, reject) => {
      cos.getObject({ Bucket: BUCKET, Region: REGION, Key: key }, (e, d) => { if (e) reject(e); else resolve(d) })
    })
    const buf = data.Body; const total = buf.length
    const piece = buf.slice(start, start + chunkSize)
    res.json({ code: 0, data: piece.toString('base64'), total, offset: start, size: piece.length, mime: data.headers['content-type'] || 'image/jpeg' })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.get('/getVideo', async (req, res) => {
  try {
    const { key, offset, size } = req.query
    if (!key) return res.status(400).end()
    const chunkSize = Math.min(parseInt(size, 10) || 524288, 786432)
    const start = parseInt(offset, 10) || 0
    const data = await new Promise((resolve, reject) => {
      cos.getObject({ Bucket: BUCKET, Region: REGION, Key: key }, (e, d) => { if (e) reject(e); else resolve(d) })
    })
    const buf = data.Body; const total = buf.length
    const piece = buf.slice(start, start + chunkSize)
    res.json({ code: 0, data: piece.toString('base64'), total, offset: start, size: piece.length, mime: data.headers['content-type'] || 'video/mp4' })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

module.exports = router
