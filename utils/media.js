const IMG_CACHE = {}
const ENV = 'prod-d2gq9dsgy570dcb29'
const CHUNK = 524288 // 512KB per chunk

function getKeyFromUrl(url) {
  if (!url) return ''
  try { return new URL(url).pathname.slice(1) }
  catch { return url }
}

// 分片下载：多次 callContainer 拉取，拼接后写入本地文件
async function fetchChunked(key, endpoint) {
  const chunks = []
  let offset = 0
  let total = Infinity

  while (offset < total) {
    const res = await new Promise((resolve, reject) => {
      wx.cloud.callContainer({
        config: { env: ENV },
        path: `${endpoint}?key=${encodeURIComponent(key)}&offset=${offset}&size=${CHUNK}`,
        method: 'GET',
        success: r => resolve(r.data),
        fail: reject
      })
    })
    if (!res || !res.data) throw new Error('empty chunk')
    chunks.push(res.data)
    total = res.total
    offset += res.size
    if (res.size < CHUNK) break // 最后一片
  }

  // 拼接 base64 并写入文件
  const b64 = chunks.join('')
  const ext = key.split('.').pop() || 'jpg'
  const fp = `${wx.env.USER_DATA_PATH}/cos_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().writeFile({
      filePath: fp, data: b64, encoding: 'base64',
      success: () => resolve(fp),
      fail: reject
    })
  })
}

function fetchMedia(url, endpoint) {
  return new Promise((resolve) => {
    if (!url) return resolve('')
    if (IMG_CACHE[url]) return resolve(IMG_CACHE[url])
    const key = getKeyFromUrl(url)
    if (!key) return resolve(url)
    fetchChunked(key, endpoint).then(fp => { IMG_CACHE[url] = fp; resolve(fp) }).catch(() => resolve(url))
  })
}

function fetchImage(url) { return fetchMedia(url, '/api/media/getImg') }
function fetchVideo(url) { return fetchMedia(url, '/api/media/getVideo') }

async function preloadImages(urls) {
  if (!urls || urls.length === 0) return urls
  return Promise.all(urls.map(url => url ? fetchImage(url) : Promise.resolve('')))
}

module.exports = { fetchImage, fetchVideo, preloadImages, getKeyFromUrl }
