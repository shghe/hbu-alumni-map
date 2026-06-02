/**
 * 视频迁移：cloud:// → COS https://
 * 每次处理1个视频，避免内存溢出
 */

const tcb = require('@cloudbase/node-sdk')
const mysql = require('mysql2/promise')
const crypto = require('crypto')
const https = require('https')

const app = tcb.init({
  env: 'cloud1-d7gxbwt5z89029dd1',
  secretId: process.env.COS_SECRET_ID,
  secretKey: process.env.COS_SECRET_KEY
})

const BUCKET = process.env.COS_BUCKET || 'hbu-alumni-map-1430752917'
const REGION = process.env.COS_REGION || 'ap-beijing'
const COS_BASE = `https://${BUCKET}.cos.${REGION}.myqcloud.com`

function extractKey(fileID) {
  const match = fileID.match(/cloud:\/\/[^/]+\/(.+)/)
  return match ? match[1] : fileID
}

// 上传到 COS (putObject)
function uploadToCOS(key, body) {
  return new Promise((resolve, reject) => {
    const timestamp = Math.floor(Date.now() / 1000)
    const date = new Date(timestamp * 1000).toISOString().split('T')[0]
    const host = `${BUCKET}.cos.${REGION}.myqcloud.com`
    const contentType = key.endsWith('.mp4') ? 'video/mp4' : 'application/octet-stream'

    const payloadHash = crypto.createHash('sha256').update(body).digest('hex')
    const cr = `PUT\n/${key}\n\ncontent-type:${contentType}\nhost:${host}\n\ncontent-type;host\n${payloadHash}`
    const hcr = crypto.createHash('sha256').update(cr).digest('hex')
    const sts = `TC3-HMAC-SHA256\n${timestamp}\n${date}/cos/tc3_request\n${hcr}`
    const sd = crypto.createHmac('sha256', `TC3${process.env.COS_SECRET_KEY}`).update(date).digest()
    const ss = crypto.createHmac('sha256', sd).update('cos').digest()
    const ssk = crypto.createHmac('sha256', ss).update('tc3_request').digest()
    const sig = crypto.createHmac('sha256', ssk).update(sts).digest('hex')
    const auth = `TC3-HMAC-SHA256 Credential=${process.env.COS_SECRET_ID}/${date}/cos/tc3_request, SignedHeaders=content-type;host, Signature=${sig}`

    const req = https.request({
      hostname: host, method: 'PUT', path: '/' + key,
      headers: {
        'Content-Type': contentType,
        'Authorization': auth,
        'X-TC-Timestamp': timestamp.toString(),
        'Content-Length': Buffer.byteLength(body).toString()
      },
      rejectUnauthorized: false
    }, (res) => {
      if (res.statusCode === 200) resolve()
      else reject(new Error(`COS upload failed: ${res.statusCode}`))
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function migrateNextVideo() {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '10.13.111.215',
    port: parseInt(process.env.MYSQL_PORT, 10) || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'aM66Hrf8',
    database: process.env.MYSQL_DATABASE || 'hbu_alumni_map'
  })

  // 找第一个待迁移的视频
  const [[{ cnt }]] = await conn.execute(
    "SELECT COUNT(*) as cnt FROM alumni_homes WHERE video LIKE 'cloud://%'"
  )

  if (cnt === 0) {
    await conn.end()
    return { done: 0, remaining: 0, message: '所有视频已迁移完成' }
  }

  const [[home]] = await conn.execute(
    "SELECT id, name, video FROM alumni_homes WHERE video LIKE 'cloud://%' LIMIT 1"
  )

  if (!home) {
    await conn.end()
    return { done: 0, remaining: 0, message: '全部完成' }
  }

  try {
    console.log(`迁移视频: ${home.name} (${home.video})`)
    const key = extractKey(home.video)
    const dl = await app.downloadFile({ fileID: home.video })
    await uploadToCOS(key, dl.fileContent)
    const newUrl = `${COS_BASE}/${key}`
    await conn.execute('UPDATE alumni_homes SET video = ? WHERE id = ?', [newUrl, home.id])
    console.log(`✓ ${newUrl}`)
    await conn.end()
    return { done: 1, remaining: cnt - 1, name: home.name, message: `迁移成功: ${home.name}，还有 ${cnt - 1} 个` }
  } catch (e) {
    await conn.end()
    return { done: 0, remaining: cnt, error: e.message, message: `迁移失败: ${e.message}` }
  }
}

module.exports = { migrateNextVideo }
