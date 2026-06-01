const mysql = require('mysql2/promise')

// 云托管环境中 MySQL 通过内网连接
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: parseInt(process.env.MYSQL_PORT, 10) || 3306,
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'hbu_alumni_map',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4'
})

async function initDB() {
  const dbName = process.env.MYSQL_DATABASE || 'hbu_alumni_map'

  // 先用不指定数据库的连接建库
  const initConn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: parseInt(process.env.MYSQL_PORT, 10) || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || ''
  })

  try {
    await initConn.execute(
      `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    )
    await initConn.query(`USE \`${dbName}\``)

    // 校友之家表
    await initConn.execute(`
      CREATE TABLE IF NOT EXISTS alumni_homes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        city VARCHAR(50) NOT NULL,
        latitude DECIMAL(10,7) NOT NULL,
        longitude DECIMAL(10,7) NOT NULL,
        address VARCHAR(200),
        contact_name VARCHAR(30),
        phone VARCHAR(30),
        wechat VARCHAR(50),
        hours VARCHAR(100),
        description TEXT,
        video VARCHAR(500),
        video_poster VARCHAR(500),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)

    // 校友之家照片
    await initConn.execute(`
      CREATE TABLE IF NOT EXISTS home_photos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        home_id INT NOT NULL,
        url VARCHAR(500) NOT NULL,
        sort INT DEFAULT 0,
        FOREIGN KEY (home_id) REFERENCES alumni_homes(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)

    // 校友之家服务标签
    await initConn.execute(`
      CREATE TABLE IF NOT EXISTS home_services (
        id INT AUTO_INCREMENT PRIMARY KEY,
        home_id INT NOT NULL,
        service VARCHAR(30) NOT NULL,
        FOREIGN KEY (home_id) REFERENCES alumni_homes(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)

    // 评价表
    await initConn.execute(`
      CREATE TABLE IF NOT EXISTS reviews (
        id INT AUTO_INCREMENT PRIMARY KEY,
        home_id INT NOT NULL,
        nickname VARCHAR(30) NOT NULL,
        rating TINYINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (home_id) REFERENCES alumni_homes(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)

    // 评价照片
    await initConn.execute(`
      CREATE TABLE IF NOT EXISTS review_photos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        review_id INT NOT NULL,
        url VARCHAR(500) NOT NULL,
        FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)

    // 管理员表
    await initConn.execute(`
      CREATE TABLE IF NOT EXISTS admins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        openid VARCHAR(50) NOT NULL UNIQUE,
        name VARCHAR(50)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)

    // 操作日志表
    await initConn.execute(`
      CREATE TABLE IF NOT EXISTS admin_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        openid VARCHAR(50) NOT NULL,
        admin_name VARCHAR(50),
        action VARCHAR(20) NOT NULL,
        detail JSON,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)

    // 索引（MySQL 8.0.13+ 才支持 IF NOT EXISTS，这里忽略已存在的索引错误）
    const indexes = [
      'CREATE INDEX idx_city ON alumni_homes(city)',
      'CREATE INDEX idx_reviews_home ON reviews(home_id)',
      'CREATE INDEX idx_reviews_created ON reviews(created_at DESC)',
      'CREATE INDEX idx_admins_openid ON admins(openid)',
      'CREATE INDEX idx_logs_created ON admin_logs(created_at DESC)'
    ]
    for (const sql of indexes) {
      try { await initConn.execute(sql) } catch (e) {
        if (!e.message.includes('Duplicate key')) console.error('Index:', e.message)
      }
    }

    console.log('Database initialized successfully')
  } finally {
    await initConn.end()
  }
}

module.exports = { pool, initDB }
