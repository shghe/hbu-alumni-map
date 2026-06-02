/**
 * 视频迁移：cloud:// → COS https://（每次1个视频）
 */

const tcb = require('@cloudbase/node-sdk')
const COS = require('cos-nodejs-sdk-v5')
const mysql = require('mysql2/promise')

const app = tcb.init({
  env: 'cloud1-d7gxbwt5z89029dd1',
  secretId: process.env.COS_SECRET_ID,
  secretKey: process.env.COS_SECRET_KEY
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

function putObject(key, body) {
  return new Promise((resolve, reject) => {
    cos.putObject({ Bucket: BUCKET, Region: REGION, Key: key, Body: body }, (err) => {
      if (err) reject(err); else resolve()
    })
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

  try {
    const key = extractKey(home.video)
    const dl = await app.downloadFile({ fileID: home.video })
    await putObject(key, dl.fileContent)
    const newUrl = `${COS_BASE}/${key}`
    await conn.execute('UPDATE alumni_homes SET video = ? WHERE id = ?', [newUrl, home.id])
    await conn.end()
    return { done: 1, remaining: cnt - 1, name: home.name, message: `✓ ${home.name}` }
  } catch (e) {
    await conn.end()
    return { done: 0, remaining: cnt, error: e.message, message: `✗ ${home.name}: ${e.message}` }
  }
}

async function migrateNextPoster() {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '10.13.111.215',
    port: parseInt(process.env.MYSQL_PORT, 10) || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'aM66Hrf8',
    database: process.env.MYSQL_DATABASE || 'hbu_alumni_map'
  })

  const [[{ cnt }]] = await conn.execute(
    "SELECT COUNT(*) as cnt FROM alumni_homes WHERE video_poster LIKE 'cloud://%'"
  )
  if (cnt === 0) { await conn.end(); return { done: 0, remaining: 0, message: '所有封面已迁移完成' } }

  const [[home]] = await conn.execute(
    "SELECT id, name, video_poster FROM alumni_homes WHERE video_poster LIKE 'cloud://%' LIMIT 1"
  )
  try {
    const key = extractKey(home.video_poster)
    const dl = await app.downloadFile({ fileID: home.video_poster })
    await putObject(key, dl.fileContent)
    const newUrl = `${COS_BASE}/${key}`
    await conn.execute('UPDATE alumni_homes SET video_poster = ? WHERE id = ?', [newUrl, home.id])
    await conn.end()
    return { done: 1, remaining: cnt - 1, name: home.name, message: `✓ ${home.name}` }
  } catch (e) {
    await conn.end()
    return { done: 0, remaining: cnt, error: e.message, message: `✗ ${home.name}: ${e.message}` }
  }
}

module.exports = { migrateNextVideo, migrateNextPoster }
