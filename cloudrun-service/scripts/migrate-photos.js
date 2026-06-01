/**
 * 照片迁移：cloud:// → COS https://
 * 每次处理少量文件，避免内存溢出。重复调用直到全部完成。
 */

const tcb = require('@cloudbase/node-sdk')
const COS = require('cos-nodejs-sdk-v5')
const mysql = require('mysql2/promise')

const app = tcb.init({
  env: 'cloud1-d7gxbwt5z89029dd1',
  secretId: process.env.CLOUDBASE_SECRET_ID || process.env.COS_SECRET_ID,
  secretKey: process.env.CLOUDBASE_SECRET_KEY || process.env.COS_SECRET_KEY
})

const cos = new COS({
  SecretId: process.env.COS_SECRET_ID,
  SecretKey: process.env.COS_SECRET_KEY
})
const BUCKET = process.env.COS_BUCKET || 'hbu-alumni-map-1430752917'
const REGION = process.env.COS_REGION || 'ap-beijing'
const COS_BASE = `https://${BUCKET}.cos.${REGION}.myqcloud.com`

function extractKey(fileID) {
  const match = fileID.match(/cloud:\/\/[^/]+\/(.+)/)
  return match ? match[1] : fileID
}

async function migrateNextBatch(batchSize = 3) {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '10.13.111.215',
    port: parseInt(process.env.MYSQL_PORT, 10) || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'aM66Hrf8',
    database: process.env.MYSQL_DATABASE || 'hbu_alumni_map'
  })

  const done = { photos: 0, posters: 0, errors: [] }
  let remaining = 0

  // 1. home_photos
  const [[{ cnt: p1 }]] = await conn.execute(
    "SELECT COUNT(*) as cnt FROM home_photos WHERE url LIKE 'cloud://%'"
  )
  if (p1 > 0 && done.photos < batchSize) {
    const [rows] = await conn.execute(
      "SELECT id, url FROM home_photos WHERE url LIKE 'cloud://%' LIMIT ?", [batchSize]
    )
    for (const row of rows) {
      try {
        const key = extractKey(row.url)
        const dl = await app.downloadFile({ fileID: row.url })
        await new Promise((resolve, reject) => {
          cos.putObject({ Bucket: BUCKET, Region: REGION, Key: key, Body: dl.fileContent }, (err, data) => {
            if (err) reject(err); else resolve(data)
          })
        })
        const newUrl = `${COS_BASE}/${key}`
        await conn.execute('UPDATE home_photos SET url = ? WHERE id = ?', [newUrl, row.id])
        done.photos++
      } catch (e) { done.errors.push(e.message) }
    }
  }

  // 2. review_photos
  const [[{ cnt: p2 }]] = await conn.execute(
    "SELECT COUNT(*) as cnt FROM review_photos WHERE url LIKE 'cloud://%'"
  )
  const quota = batchSize - done.photos - done.posters
  if (p2 > 0 && quota > 0) {
    const [rows] = await conn.execute(
      "SELECT id, url FROM review_photos WHERE url LIKE 'cloud://%' LIMIT ?", [quota]
    )
    for (const row of rows) {
      try {
        const key = extractKey(row.url)
        const dl = await app.downloadFile({ fileID: row.url })
        await new Promise((resolve, reject) => {
          cos.putObject({ Bucket: BUCKET, Region: REGION, Key: key, Body: dl.fileContent }, (err, data) => {
            if (err) reject(err); else resolve(data)
          })
        })
        const newUrl = `${COS_BASE}/${key}`
        await conn.execute('UPDATE review_photos SET url = ? WHERE id = ?', [newUrl, row.id])
        done.photos++
      } catch (e) { done.errors.push(e.message) }
    }
  }

  // Count remaining
  remaining = p1 + p2 - done.photos

  await conn.end()
  return {
    done: done.photos,
    errors: done.errors,
    remaining,
    message: remaining > 0 ? `还有 ${remaining} 个文件未迁移，请再次访问此接口` : '全部完成!'
  }
}

module.exports = { migrateNextBatch }
