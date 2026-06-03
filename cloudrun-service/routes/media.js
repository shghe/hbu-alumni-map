const crypto = require('crypto')
const dns = require('dns')
const express = require('express')
const COS = require('cos-nodejs-sdk-v5')
const { pool } = require('../utils/db')

const router = express.Router()
const BUCKET = process.env.COS_BUCKET || 'hbu-alumni-map-single-shanghai-1430752917'
const REGION = process.env.COS_REGION || 'ap-shanghai'
const cos = new COS({ SecretId: process.env.COS_SECRET_ID, SecretKey: process.env.COS_SECRET_KEY })

const DOWNLOAD_CHUNK_MAX = 786432
const UPLOAD_PART_MAX_BASE64 = 3 * 1024 * 1024

function cosCall(method, params) {
  return new Promise((resolve, reject) => {
    cos[method](params, (err, data) => {
      if (err) reject(err)
      else resolve(data)
    })
  })
}

function normalizeKey(value) {
  if (!value || typeof value !== 'string') return ''
  let key = value.trim()
  try {
    const parsed = new URL(key)
    key = parsed.pathname.slice(1)
  } catch {}
  try { key = decodeURIComponent(key) } catch {}
  key = key.split('?')[0].replace(/^\/+/, '')
  if (!/^(homes|reviews)\//.test(key)) return ''
  if (key.includes('..') || key.includes('\\')) return ''
  return key
}

async function isAdmin(req) {
  const openid = req.headers['x-wx-openid']
  if (!openid) return false
  try {
    const [[admin]] = await pool.execute('SELECT id FROM admins WHERE openid = ?', [openid])
    return Boolean(admin)
  } catch {
    return false
  }
}

async function canUpload(req, key) {
  if (key.startsWith('reviews/')) return true
  if (key.startsWith('homes/')) return isAdmin(req)
  return false
}

async function getObjectChunk(key, start, size) {
  const head = await cosCall('headObject', { Bucket: BUCKET, Region: REGION, Key: key })
  const total = Number(head.headers && head.headers['content-length']) || 0
  if (!total || start >= total) {
    return { total, body: Buffer.alloc(0), mime: (head.headers && head.headers['content-type']) || 'application/octet-stream' }
  }

  const end = Math.min(start + size - 1, total - 1)
  const data = await cosCall('getObject', { Bucket: BUCKET, Region: REGION, Key: key, Range: `bytes=${start}-${end}` })
  return {
    total,
    body: Buffer.isBuffer(data.Body) ? data.Body : Buffer.from(data.Body || ''),
    mime: (head.headers && head.headers['content-type']) || (data.headers && data.headers['content-type']) || 'application/octet-stream'
  }
}

async function downloadChunk(req, res, fallbackMime) {
  try {
    const key = normalizeKey(req.query.key)
    if (!key) return res.status(400).json({ code: 400, message: 'invalid key' })

    const start = Math.max(parseInt(req.query.offset, 10) || 0, 0)
    const size = Math.min(Math.max(parseInt(req.query.size, 10) || 393216, 1), DOWNLOAD_CHUNK_MAX)
    const chunk = await getObjectChunk(key, start, size)

    res.json({
      code: 0,
      data: chunk.body.toString('base64'),
      total: chunk.total,
      offset: start,
      size: chunk.body.length,
      mime: chunk.mime || fallbackMime
    })
  } catch (e) {
    console.error('media download error:', e)
    res.status(500).json({ code: 500, message: e.message })
  }
}

router.get('/getImg', (req, res) => downloadChunk(req, res, 'image/jpeg'))
router.get('/getVideo', (req, res) => downloadChunk(req, res, 'video/mp4'))

router.post('/upload/init', async (req, res) => {
  try {
    const key = normalizeKey(req.body && req.body.key)
    if (!key) return res.status(400).json({ code: 400, message: 'invalid key' })
    if (!(await canUpload(req, key))) return res.status(401).json({ code: 401, message: '无权限' })

    const data = await cosCall('multipartInit', { Bucket: BUCKET, Region: REGION, Key: key })
    res.json({ code: 0, uploadId: data.UploadId })
  } catch (e) {
    console.error('media upload init error:', e)
    res.status(500).json({ code: 500, message: e.message })
  }
})

router.post('/upload/part', async (req, res) => {
  try {
    const body = req.body || {}
    const key = normalizeKey(body.key)
    const uploadId = String(body.uploadId || '')
    const partNumber = parseInt(body.partNumber, 10)
    const base64 = String(body.data || '')

    if (!key || !uploadId || !partNumber || !base64) return res.status(400).json({ code: 400, message: 'invalid part' })
    if (base64.length > UPLOAD_PART_MAX_BASE64) return res.status(413).json({ code: 413, message: 'part too large' })
    if (!(await canUpload(req, key))) return res.status(401).json({ code: 401, message: '无权限' })

    const data = await cosCall('multipartUpload', {
      Bucket: BUCKET,
      Region: REGION,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
      Body: Buffer.from(base64, 'base64')
    })
    res.json({ code: 0, partNumber, etag: data.ETag || data.headers?.etag || '' })
  } catch (e) {
    console.error('media upload part error:', e)
    res.status(500).json({ code: 500, message: e.message })
  }
})

router.post('/upload/complete', async (req, res) => {
  try {
    const body = req.body || {}
    const key = normalizeKey(body.key)
    const uploadId = String(body.uploadId || '')
    const parts = Array.isArray(body.parts)
      ? body.parts.map(p => ({ PartNumber: Number(p.partNumber || p.PartNumber), ETag: p.etag || p.ETag })).filter(p => p.PartNumber && p.ETag)
      : []

    if (!key || !uploadId || parts.length === 0) return res.status(400).json({ code: 400, message: 'invalid complete' })
    if (!(await canUpload(req, key))) return res.status(401).json({ code: 401, message: '无权限' })

    parts.sort((a, b) => a.PartNumber - b.PartNumber)
    await cosCall('multipartComplete', { Bucket: BUCKET, Region: REGION, Key: key, UploadId: uploadId, Parts: parts })
    res.json({ code: 0, url: `https://${BUCKET}.cos.${REGION}.myqcloud.com/${key}` })
  } catch (e) {
    console.error('media upload complete error:', e)
    res.status(500).json({ code: 500, message: e.message })
  }
})

router.post('/upload/abort', async (req, res) => {
  try {
    const key = normalizeKey(req.body && req.body.key)
    const uploadId = String((req.body && req.body.uploadId) || '')
    if (key && uploadId) await cosCall('multipartAbort', { Bucket: BUCKET, Region: REGION, Key: key, UploadId: uploadId })
    res.json({ code: 0 })
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message })
  }
})

router.get('/diag', async (req, res) => {
  const host = `${BUCKET}.cos.${REGION}.myqcloud.com`
  dns.lookup(host, { all: true }, async (err, records) => {
    const ips = err ? [] : records.map(r => r.address)
    let headOk = false
    let requestId = ''
    try {
      const key = normalizeKey(req.query.key) || 'health-check-not-required'
      if (req.query.key) {
        const head = await cosCall('headObject', { Bucket: BUCKET, Region: REGION, Key: key })
        headOk = true
        requestId = head.headers?.['x-cos-request-id'] || ''
      }
    } catch (e) {
      requestId = e.headers?.['x-cos-request-id'] || ''
    }
    res.json({
      code: 0,
      host,
      ips,
      privateIp: ips.some(ip => /^(10\.|100\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(ip)),
      headOk,
      requestId,
      nonce: crypto.randomBytes(4).toString('hex')
    })
  })
})

module.exports = router
