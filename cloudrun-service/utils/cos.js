const COS = require('cos-nodejs-sdk-v5')
const crypto = require('crypto')

const SECRET_ID = process.env.COS_SECRET_ID
const SECRET_KEY = process.env.COS_SECRET_KEY
const BUCKET = process.env.COS_BUCKET || 'hbu-alumni-map-single-1430752917'
const REGION = process.env.COS_REGION || 'ap-beijing'
const PUBLIC_BASE_URL = process.env.MEDIA_PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL || ''
const STREAM_SECRET = process.env.MEDIA_STREAM_SECRET || ''
const MEDIA_URL_TTL = parseInt(process.env.MEDIA_URL_TTL, 10) || 7 * 24 * 60 * 60
const COS_DOMAIN = process.env.COS_DOMAIN || process.env.COS_INTERNAL_DOMAIN || ''
const cosConfig = { SecretId: SECRET_ID, SecretKey: SECRET_KEY }
if (COS_DOMAIN) cosConfig.Domain = COS_DOMAIN
const cos = new COS(cosConfig)

function normalizeKey(value) {
  if (!value) return ''
  let key = String(value)
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

function normalizeCosUrl(url) {
  const key = normalizeKey(url)
  if (!key) return url || ''
  return key
}

function mediaSignature(key, expires) {
  if (!STREAM_SECRET) return ''
  return crypto.createHmac('sha256', STREAM_SECRET).update(`${key}:${expires}`).digest('hex')
}

function mediaExpires() {
  const ttl = Math.max(MEDIA_URL_TTL, 60)
  const now = Math.floor(Date.now() / 1000)
  const bucketStart = Math.floor(now / ttl) * ttl
  return bucketStart + ttl * 2
}

function verifyMediaSignature(key, expires, signature) {
  if (!STREAM_SECRET) return true
  const exp = Number(expires)
  if (!exp || exp < Math.floor(Date.now() / 1000)) return false
  const expected = mediaSignature(key, exp)
  if (!signature || signature.length !== expected.length) return false
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
}

function toMediaUrl(url) {
  const key = normalizeKey(url)
  if (!key) return url || ''
  const params = [`key=${encodeURIComponent(key)}`]
  if (STREAM_SECRET) {
    const expires = mediaExpires()
    params.push(`e=${expires}`)
    params.push(`s=${mediaSignature(key, expires)}`)
  }
  return `/api/media/stream?${params.join('&')}`
}

function deleteFile(keyOrUrl) {
  const key = normalizeKey(keyOrUrl)
  if (!key) return Promise.resolve()
  return new Promise((resolve, reject) => {
    cos.deleteObject({ Bucket: BUCKET, Region: REGION, Key: key }, (err, data) => {
      if (err) reject(err)
      else resolve(data)
    })
  })
}

async function signUrls(urls) {
  if (!urls || urls.length === 0) return []
  return urls.map(toMediaUrl)
}

module.exports = {
  BUCKET,
  REGION,
  cos,
  signUrls,
  deleteFile,
  normalizeKey,
  normalizeCosUrl,
  toMediaUrl,
  verifyMediaSignature
}
