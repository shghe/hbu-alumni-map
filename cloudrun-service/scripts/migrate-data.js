/**
 * 数据迁移脚本：微信云开发 DB → MySQL
 *
 * 用法：
 *   1. 先在云函数中部署此脚本（或本地用 wx-server-sdk 运行）
 *   2. 从云数据库中读取所有数据
 *   3. 写入 MySQL
 *
 * 注意：需要先安装 wx-server-sdk 并配置云环境密钥
 */
const cloud = require('wx-server-sdk')
const mysql = require('mysql2/promise')

cloud.init({ env: 'cloud1-d7gxbwt5z89029dd1' })
const db = cloud.database()

async function migrate() {
  const mysqlConn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: parseInt(process.env.MYSQL_PORT, 10) || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'hbu_alumni_map'
  })

  console.log('开始迁移...')

  // 1. 迁移校友之家
  const { data: homes } = await db.collection('alumni_homes').limit(100).get()
  console.log(`发现 ${homes.length} 个校友之家`)

  const idMap = {} // old _id → new id

  for (const home of homes) {
    const [result] = await mysqlConn.execute(
      `INSERT INTO alumni_homes (name, city, latitude, longitude, address, contact_name, phone, wechat, hours, description, video, video_poster)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [home.name, home.city, home.latitude, home.longitude,
       home.address || null, home.contactName || null, home.phone || null, home.wechat || null,
       home.hours || null, home.description || null, home.video || null, home.videoPoster || null]
    )
    const newId = result.insertId
    idMap[home._id] = newId
    console.log(`  ✓ ${home.name} (${home._id} → ${newId})`)

    // 迁移 photos 数组
    if (home.photos && home.photos.length > 0) {
      const values = home.photos.map((url, i) => [newId, url, i])
      await mysqlConn.query('INSERT INTO home_photos (home_id, url, sort) VALUES ?', [values])
    }

    // 迁移 services 数组
    if (home.services && home.services.length > 0) {
      const values = home.services.map(s => [newId, s])
      await mysqlConn.query('INSERT INTO home_services (home_id, service) VALUES ?', [values])
    }
  }

  // 2. 迁移评价
  const { data: reviews } = await db.collection('reviews').limit(500).get()
  console.log(`发现 ${reviews.length} 条评价`)

  for (const review of reviews) {
    const newHomeId = idMap[review.homeId]
    if (!newHomeId) {
      console.log(`  ⚠ 跳过评价 ${review._id}: homeId ${review.homeId} 无对应校友之家`)
      continue
    }

    const [result] = await mysqlConn.execute(
      'INSERT INTO reviews (home_id, nickname, rating, content, created_at) VALUES (?, ?, ?, ?, ?)',
      [newHomeId, review.nickname, review.rating, review.content, review.createTime]
    )
    const newReviewId = result.insertId

    // 迁移评价照片
    if (review.photos && review.photos.length > 0) {
      const values = review.photos.map(url => [newReviewId, url])
      await mysqlConn.query('INSERT INTO review_photos (review_id, url) VALUES ?', [values])
    }
    console.log(`  ✓ 评价 ${review._id} → ${newReviewId}`)
  }

  // 3. 迁移管理员
  const { data: admins } = await db.collection('admins').limit(100).get()
  console.log(`发现 ${admins.length} 个管理员`)
  for (const admin of admins) {
    await mysqlConn.execute(
      'INSERT IGNORE INTO admins (openid, name) VALUES (?, ?)',
      [admin.openid, admin.name || null]
    )
    console.log(`  ✓ 管理员 ${admin.openid}`)
  }

  // 4. 迁移操作日志
  const { data: logs } = await db.collection('admin_logs').orderBy('createTime', 'desc').limit(200).get()
  console.log(`发现 ${logs.length} 条日志`)
  for (const log of logs) {
    await mysqlConn.execute(
      'INSERT INTO admin_logs (openid, admin_name, action, detail, created_at) VALUES (?, ?, ?, ?, ?)',
      [log.openid, log.adminName, log.action, JSON.stringify(log.detail || {}), log.createTime]
    )
  }

  console.log('迁移完成!')
  console.log(`ID 映射表: ${JSON.stringify(idMap)}`)

  await mysqlConn.end()
}

migrate().catch(err => {
  console.error('迁移失败:', err)
  process.exit(1)
})
