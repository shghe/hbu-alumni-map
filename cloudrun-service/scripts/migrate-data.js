/**
 * 数据迁移脚本：云开发 NoSQL → MySQL
 *
 * 用法：
 *   cd cloudrun-service
 *   npm install @cloudbase/node-sdk mysql2 dotenv
 *   node scripts/migrate-data.js
 */

require('dotenv').config()
const tcb = require('@cloudbase/node-sdk')
const mysql = require('mysql2/promise')

// 连接云开发 NoSQL 数据库（只读）
const app = tcb.init({
  env: 'cloud1-d7gxbwt5z89029dd1',
  secretId: process.env.CLOUDBASE_SECRET_ID || process.env.COS_SECRET_ID,
  secretKey: process.env.CLOUDBASE_SECRET_KEY || process.env.COS_SECRET_KEY
})
const db = app.database()

async function runMigration() {
  console.log('连接 MySQL...')
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '10.13.111.215',
    port: parseInt(process.env.MYSQL_PORT, 10) || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'aM66Hrf8',
    database: process.env.MYSQL_DATABASE || 'hbu_alumni_map'
  })

  console.log('清空旧数据...')
  await conn.execute('SET FOREIGN_KEY_CHECKS = 0')
  await conn.execute('TRUNCATE review_photos')
  await conn.execute('TRUNCATE reviews')
  await conn.execute('TRUNCATE home_services')
  await conn.execute('TRUNCATE home_photos')
  await conn.execute('TRUNCATE admin_logs')
  await conn.execute('TRUNCATE alumni_homes')
  await conn.execute('TRUNCATE admins')
  await conn.execute('SET FOREIGN_KEY_CHECKS = 1')

  // 1. 迁移校友之家
  console.log('\n读取校友之家...')
  const { data: homes } = await db.collection('alumni_homes').limit(200).get()
  console.log(`找到 ${homes.length} 个校友之家`)

  const idMap = {} // old _id → new id

  for (const home of homes) {
    const [result] = await conn.execute(
      `INSERT INTO alumni_homes (name, city, latitude, longitude, address, contact_name, phone, wechat, hours, description, video, video_poster)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [home.name, home.city, home.latitude, home.longitude,
       home.address || null, home.contactName || null, home.phone || null, home.wechat || null,
       home.hours || null, home.description || null, home.video || null, home.videoPoster || null]
    )
    const newId = result.insertId
    idMap[home._id] = newId
    console.log(`  ✓ ${home.name} (${home._id} → ${newId})`)

    // 迁移照片
    if (home.photos && home.photos.length > 0) {
      const values = home.photos.map((url, i) => [newId, url, i])
      await conn.query('INSERT INTO home_photos (home_id, url, sort) VALUES ?', [values])
    }
    // 迁移服务标签
    if (home.services && home.services.length > 0) {
      const values = home.services.map(s => [newId, s])
      await conn.query('INSERT INTO home_services (home_id, service) VALUES ?', [values])
    }
  }

  // 2. 迁移评价
  console.log('\n读取评价...')
  const { data: reviews } = await db.collection('reviews').limit(500).get()
  console.log(`找到 ${reviews.length} 条评价`)

  for (const review of reviews) {
    const newHomeId = idMap[review.homeId]
    if (!newHomeId) {
      console.log(`  ⚠ 跳过: homeId ${review.homeId} 无对应校友之家`)
      continue
    }
    const [result] = await conn.execute(
      'INSERT INTO reviews (home_id, nickname, rating, content, created_at) VALUES (?, ?, ?, ?, ?)',
      [newHomeId, review.nickname, review.rating, review.content, review.createTime]
    )
    if (review.photos && review.photos.length > 0) {
      const values = review.photos.map(url => [result.insertId, url])
      await conn.query('INSERT INTO review_photos (review_id, url) VALUES ?', [values])
    }
    console.log(`  ✓ 评价 → ${result.insertId}`)
  }

  // 3. 迁移管理员
  console.log('\n读取管理员...')
  try {
    const { data: admins } = await db.collection('admins').limit(100).get()
    console.log(`找到 ${admins.length} 个管理员`)
    for (const admin of admins) {
      await conn.execute('INSERT IGNORE INTO admins (openid, name) VALUES (?, ?)',
        [admin.openid, admin.name || null])
      console.log(`  ✓ ${admin.openid}`)
    }
  } catch (e) {
    console.log('  管理员表可能为空, 跳过')
  }

  // 4. 迁移操作日志
  console.log('\n读取操作日志...')
  try {
    const { data: logs } = await db.collection('admin_logs').orderBy('createTime', 'desc').limit(200).get()
    console.log(`找到 ${logs.length} 条日志`)
    for (const log of logs) {
      await conn.execute(
        'INSERT INTO admin_logs (openid, admin_name, action, detail, created_at) VALUES (?, ?, ?, ?, ?)',
        [log.openid, log.adminName, log.action, JSON.stringify(log.detail || {}), log.createTime]
      )
    }
  } catch (e) {
    console.log('  日志表可能为空, 跳过')
  }

  console.log('\n=== 迁移完成! ===')
  console.log(`校友之家: ${homes.length} 个`)
  console.log(`评价: ${reviews.length} 条`)
  console.log('ID 映射:', JSON.stringify(idMap))

  await conn.end()
}

// 直接运行时执行迁移
if (require.main === module) {
  runMigration().catch(err => {
    console.error('迁移失败:', err)
    process.exit(1)
  })
}

module.exports = { runMigration }
