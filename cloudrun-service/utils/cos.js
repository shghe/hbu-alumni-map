const COS = require('cos-nodejs-sdk-v5')

const SECRET_ID = process.env.COS_SECRET_ID
const SECRET_KEY = process.env.COS_SECRET_KEY
const BUCKET = process.env.COS_BUCKET || 'hbu-alumni-map-single-shanghai-1430752917'
const REGION = process.env.COS_REGION || 'ap-shanghai'
const cos = new COS({ SecretId: SECRET_ID, SecretKey: SECRET_KEY })

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
  return key
}

function normalizeCosUrl(url) {
  const key = normalizeKey(url)
  if (!key) return url || ''
  return `https://${BUCKET}.cos.${REGION}.myqcloud.com/${key}`
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
  return urls.map(normalizeCosUrl)
}

module.exports = { BUCKET, REGION, signUrls, deleteFile, normalizeKey, normalizeCosUrl }
