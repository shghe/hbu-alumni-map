#!/usr/bin/env node
/**
 * 从线上 /api/homes 的 JSON 快照生成 data/homes.js 兜底数据。
 *
 * 用法：
 *   node scripts/sync-fallback-data.mjs --from /tmp/homes.json
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fromIndex = process.argv.indexOf('--from')
const inputPath = fromIndex >= 0 ? process.argv[fromIndex + 1] : '/tmp/homes.json'
const outputPath = path.join(__dirname, '..', 'data', 'homes.js')

const raw = fs.readFileSync(inputPath, 'utf8')
const payload = JSON.parse(raw)
const homes = payload.data || payload

function mediaKey(value) {
  if (!value) return ''
  const str = String(value)
  if (/^(homes|reviews)\//.test(str)) return str
  try {
    const parsed = new URL(str, 'http://media.local')
    if (parsed.pathname === '/api/media/stream') return parsed.searchParams.get('key') || ''
    return parsed.pathname.replace(/^\/+/, '')
  } catch {
    return ''
  }
}

const rows = homes.map((home) => ({
  id: home.id,
  name: home.name,
  city: home.city,
  latitude: Number(home.latitude),
  longitude: Number(home.longitude),
  address: home.address || '',
  contactName: home.contactName || home.contact_name || '',
  phone: home.phone || '',
  wechat: home.wechat || '',
  hours: home.hours || '',
  services: Array.isArray(home.services) ? home.services : [],
  description: home.description || '',
  video: mediaKey(home.video),
  videoPoster: mediaKey(home.videoPoster || home.video_poster),
  photos: (home.photos || []).map(mediaKey).filter(Boolean)
}))

const content = `const homes = ${JSON.stringify(rows, null, 2)}\n\nmodule.exports = homes\n`
fs.writeFileSync(outputPath, content)
console.log(`已生成 ${outputPath}（${rows.length} 条）`)
