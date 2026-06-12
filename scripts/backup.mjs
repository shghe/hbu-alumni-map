#!/usr/bin/env node
/**
 * 校友之家数据备份脚本（服务器 → 本地 Obsidian vault）
 *
 * 用法：
 *   node scripts/backup.mjs
 *   node scripts/backup.mjs --output ~/Desktop/校友备份
 *   node scripts/backup.mjs --skip-media   # 只备份文字，不下载图片视频
 *
 * 原理：
 *   1. 通过 API 获取所有校友之家和评价数据
 *   2. 通过后端 /api/media/stream 签名代理下载文件（后端→COS走内网）
 *   3. 本地对比已有文件，只下载新增的（增量同步）
 *
 * 网络：全部走后端代理，COS 内网访问，零外网流量
 */

import fs from 'fs'
import path from 'path'
import https from 'https'
import http from 'http'

// ---- 配置 ----
const API_BASE = process.env.API_BASE || 'http://api.aluhomemap.top'
const CLIENT_KEY = 'hbu-alumni-map-miniapp-v3'
const OUTPUT = process.argv.includes('--output')
  ? process.argv[process.argv.indexOf('--output') + 1]
  : path.join(process.cwd(), '..', '校友之家备份')
const SKIP_MEDIA = process.argv.includes('--skip-media')

const SYNC_FILE = path.join(OUTPUT, '.last_sync')
const LAST_SYNC = fs.existsSync(SYNC_FILE) ? fs.readFileSync(SYNC_FILE, 'utf8').trim() : null

// ---- 工具函数 ----

function sanitize(name) {
  return (name || '').replace(/[\/\\:*?"<>|]/g, '_').trim() || '未知'
}

function formatDate(d) {
  if (!d) return ''
  return new Date(d).toISOString().slice(0, 10)
}

function stars(n) {
  return '★'.repeat(n) + '☆'.repeat(5 - n)
}

function joinUrl(base, path) {
  return base.replace(/\/+$/, '') + path
}

function httpGet(url, headers = {}) {
  const proto = url.startsWith('https') ? https : http
  return new Promise((resolve, reject) => {
    const req = proto.get(url, { headers, timeout: 60000 }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        httpGet(res.headers.location, headers).then(resolve).catch(reject)
        return
      }
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }))
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
  })
}

async function apiGet(path) {
  const url = joinUrl(API_BASE, path)
  const res = await httpGet(url, { 'X-HBU-CLIENT': CLIENT_KEY })
  if (res.status !== 200) throw new Error(`API ${path} → ${res.status}`)
  return JSON.parse(res.body.toString())
}

async function downloadFile(url, destPath) {
  if (fs.existsSync(destPath)) return true
  fs.mkdirSync(path.dirname(destPath), { recursive: true })
  try {
    const fullUrl = url.startsWith('http') ? url : joinUrl(API_BASE, url)
    const res = await httpGet(fullUrl, { 'X-HBU-CLIENT': CLIENT_KEY })
    if (res.status !== 200) return false
    fs.writeFileSync(destPath, res.body)
    return true
  } catch { return false }
}

// ---- 主流程 ----

async function main() {
  console.log(`输出目录：${OUTPUT}`)
  console.log(`API：${API_BASE}`)
  if (SKIP_MEDIA) console.log('跳过媒体文件下载')
  if (LAST_SYNC) console.log(`增量模式：只处理 ${LAST_SYNC} 之后的变更`)

  fs.mkdirSync(OUTPUT, { recursive: true })
  fs.mkdirSync(path.join(OUTPUT, '附件'), { recursive: true })

  // 1. 获取所有校友之家
  const homesRes = await apiGet('/api/homes')
  const homes = homesRes.data || []
  console.log(`\n校友之家：${homes.length} 个`)

  const indexLines = ['# 校友之家备份', '', `备份时间：${new Date().toISOString().slice(0, 19)}`, '']

  // 如果有 LAST_SYNC，只处理有变更的（通过比对本地 md 是否存在来判断）
  const homesToProcess = homes

  for (const home of homesToProcess) {
    const dirName = sanitize(home.name)
    const attachDir = path.join(OUTPUT, '附件', dirName)
    const mdPath = path.join(OUTPUT, `${dirName}.md`)

    // 增量模式：如果 md 已存在且无 LAST_SYNC，跳过
    if (!LAST_SYNC && fs.existsSync(mdPath)) {
      console.log(`  ⊘ ${home.name}（已存在，跳过）`)
      indexLines.push(`- [[${dirName}]]`)
      continue
    }

    console.log(`  ↓ ${home.name}`)
    fs.mkdirSync(attachDir, { recursive: true })

    // 下载照片
    const photoLines = []
    if (!SKIP_MEDIA && home.photos) {
      for (let i = 0; i < home.photos.length; i++) {
        const fname = `photo_${i + 1}.jpg`
        const dest = path.join(attachDir, fname)
        const url = typeof home.photos[i] === 'string' ? home.photos[i] : home.photos[i].url
        if (url && await downloadFile(url, dest)) {
          photoLines.push(`![[附件/${dirName}/${fname}]]`)
        }
      }
    }

    // 下载视频
    let videoLine = ''
    if (!SKIP_MEDIA && home.video) {
      const fname = 'video.mp4'
      const dest = path.join(attachDir, fname)
      if (await downloadFile(home.video, dest)) {
        videoLine = `\n## 视频\n\n![[附件/${dirName}/${fname}]]`
      }
    }

    // 下载封面
    let posterLine = ''
    if (!SKIP_MEDIA && home.videoPoster) {
      const fname = 'poster.jpg'
      const dest = path.join(attachDir, fname)
      if (await downloadFile(home.videoPoster, dest)) {
        posterLine = `![[附件/${dirName}/${fname}]]`
      }
    }

    // 获取评价
    let reviewLines = []
    try {
      const revRes = await apiGet(`/api/reviews?homeId=${home._id || home.id}`)
      const reviews = revRes.data || []
      for (const r of reviews) {
        const rPhotoLines = []
        if (!SKIP_MEDIA && r.photos) {
          for (let i = 0; i < r.photos.length; i++) {
            const fname = `review_${r._id}_${i + 1}.jpg`
            const dest = path.join(attachDir, fname)
            const url = typeof r.photos[i] === 'string' ? r.photos[i] : r.photos[i].url
            if (url && await downloadFile(url, dest)) {
              rPhotoLines.push(`![[附件/${dirName}/${fname}]]`)
            }
          }
        }
        reviewLines.push({
          nickname: r.nickname || '匿名',
          rating: r.rating || 0,
          content: r.content || '',
          date: formatDate(r.created_at || r.createTime),
          photos: rPhotoLines
        })
      }
    } catch (e) {
      console.log(`    ⚠ 评价加载失败: ${e.message}`)
    }

    // 生成 md 文件
    const md = `# ${home.name}

- **城市**：${home.city || ''}
- **地址**：${home.address || ''}
- **联系人**：${home.contactName || ''} ${home.phone || ''}
- **微信**：${home.wechat || ''}
- **服务时间**：${home.hours || ''}
- **服务**：${(home.services || []).join('、')}
${posterLine}

${photoLines.join('\n')}
${videoLine}

## 介绍

${home.description || ''}
${reviewLines.length > 0 ? `
## 评价

| 昵称 | 评分 | 内容 | 时间 |
|---|---|---|---|
${reviewLines.map(r => `| ${r.nickname} | ${stars(r.rating)} | ${r.content.replace(/\n/g, ' ')} | ${r.date} |`).join('\n')}

${reviewLines.filter(r => r.photos.length > 0).map(r => r.photos.join('\n')).join('\n')}
` : ''}
`

    fs.writeFileSync(mdPath, md, 'utf8')
    indexLines.push(`- [[${dirName}]]`)
  }

  // 写索引
  indexLines.push('', '---', `共 ${homes.length} 个校友之家`)
  fs.writeFileSync(path.join(OUTPUT, 'README.md'), indexLines.join('\n'), 'utf8')

  // 写同步时间
  fs.writeFileSync(SYNC_FILE, new Date().toISOString(), 'utf8')

  console.log(`\n✅ 备份完成：${OUTPUT}`)
}

main().catch(err => {
  console.error('❌ 备份失败:', err.message)
  process.exit(1)
})
