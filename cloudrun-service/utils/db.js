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
  const conn = await pool.getConnection()
  try {
    // 创建数据库（如不存在）
    await conn.execute(
      `CREATE DATABASE IF NOT EXISTS \`${process.env.MYSQL_DATABASE || 'hbu_alumni_map'}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    )
    await conn.execute(`USE \`${process.env.MYSQL_DATABASE || 'hbu_alumni_map'}\``)

    // 校友之家表
    await conn.execute(`
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
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS home_photos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        home_id INT NOT NULL,
        url VARCHAR(500) NOT NULL,
        sort INT DEFAULT 0,
        FOREIGN KEY (home_id) REFERENCES alumni_homes(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)

    // 校友之家服务标签
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS home_services (
        id INT AUTO_INCREMENT PRIMARY KEY,
        home_id INT NOT NULL,
        service VARCHAR(30) NOT NULL,
        FOREIGN KEY (home_id) REFERENCES alumni_homes(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)

    // 评价表
    await conn.execute(`
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
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS review_photos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        review_id INT NOT NULL,
        url VARCHAR(500) NOT NULL,
        FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)

    // 管理员表
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS admins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        openid VARCHAR(50) NOT NULL UNIQUE,
        name VARCHAR(50)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)

    // 操作日志表
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS admin_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        openid VARCHAR(50) NOT NULL,
        admin_name VARCHAR(50),
        action VARCHAR(20) NOT NULL,
        detail JSON,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)

    // 索引
    await conn.execute('CREATE INDEX IF NOT EXISTS idx_city ON alumni_homes(city)')
    await conn.execute('CREATE INDEX IF NOT EXISTS idx_reviews_home ON reviews(home_id)')
    await conn.execute('CREATE INDEX IF NOT EXISTS idx_reviews_created ON reviews(created_at DESC)')
    await conn.execute('CREATE INDEX IF NOT EXISTS idx_admins_openid ON admins(openid)')
    await conn.execute('CREATE INDEX IF NOT EXISTS idx_logs_created ON admin_logs(created_at DESC)')

    console.log('Database initialized successfully')
  } finally {
    conn.release()
  }
}

module.exports = { pool, initDB }
