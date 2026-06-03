const IMG_CACHE = {}
const PENDING_CACHE = {}
const ENV = 'prod-d2gq9dsgy570dcb29'
const SERVICE = 'alumni-api'
const IMAGE_CHUNK = 393216 // 384KB; divisible by 3, so base64 chunks can be concatenated safely.
const VIDEO_CHUNK = 688128 // 672KB; keeps base64 JSON below the 1MB-ish callContainer response ceiling.
const CACHE_KEY = 'media_file_cache_v1'

function isLocalFile(url) {
  return /^wxfile:\/\//.test(url) || /^http:\/\/tmp\//.test(url) || /^\/assets\//.test(url)
}

function getKeyFromUrl(url) {
  if (!url || isLocalFile(url)) return ''
  if (/^(homes|reviews)\//.test(url)) return url

  try {
    const parsed = new URL(url)
    if (!/\.cos\.[^.]+\.myqcloud\.com$/.test(parsed.hostname) && !parsed.hostname.includes('.cos-internal.')) {
      return ''
    }
    let key = parsed.pathname.slice(1)
    try { key = decodeURIComponent(key) } catch (e) {}
    return key.split('?')[0]
  } catch (e) {
    return ''
  }
}

function localPathForKey(key) {
  const safeName = key.replace(/[^\w.-]/g, '_')
  return `${wx.env.USER_DATA_PATH}/cos_${safeName}`
}

function fileExists(filePath) {
  return new Promise((resolve) => {
    wx.getFileSystemManager().access({
      path: filePath,
      success: () => resolve(true),
      fail: () => resolve(false)
    })
  })
}

function getCacheMap() {
  try { return wx.getStorageSync(CACHE_KEY) || {} }
  catch (e) { return {} }
}

function setCachedFile(key, filePath) {
  IMG_CACHE[key] = filePath
  try {
    const cache = getCacheMap()
    cache[key] = filePath
    wx.setStorageSync(CACHE_KEY, cache)
  } catch (e) {}
}

async function getCachedFile(key) {
  const cached = IMG_CACHE[key] || getCacheMap()[key] || localPathForKey(key)
  if (cached && await fileExists(cached)) return cached
  return ''
}

function callMedia(path) {
  return new Promise((resolve, reject) => {
    wx.cloud.callContainer({
      config: { env: ENV, service: SERVICE },
      path,
      method: 'GET',
      header: { 'X-WX-SERVICE': SERVICE },
      timeout: 60000,
      success: (res) => resolve(res.data),
      fail: reject
    })
  })
}

async function fetchChunked(key, endpoint, chunkSize) {
  const chunks = []
  let offset = 0
  let total = Infinity

  while (offset < total) {
    const res = await callMedia(`${endpoint}?key=${encodeURIComponent(key)}&offset=${offset}&size=${chunkSize}`)
    if (!res || res.code !== 0 || !res.data || !res.size) throw new Error((res && res.message) || 'empty chunk')

    chunks.push(res.data)
    total = Number(res.total) || 0
    offset += Number(res.size) || 0
    if (!total || res.size < chunkSize) break
  }

  const filePath = localPathForKey(key)
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().writeFile({
      filePath,
      data: chunks.join(''),
      encoding: 'base64',
      success: () => resolve(filePath),
      fail: reject
    })
  })
}

function fetchMedia(url, endpoint, chunkSize) {
  return new Promise((resolve) => {
    if (!url) return resolve('')
    if (IMG_CACHE[url]) return resolve(IMG_CACHE[url])

    const key = getKeyFromUrl(url)
    if (!key) return resolve(url)
    const pendingKey = `${endpoint}:${key}`
    if (PENDING_CACHE[pendingKey]) {
      PENDING_CACHE[pendingKey].then(resolve).catch(() => resolve(''))
      return
    }

    PENDING_CACHE[pendingKey] = getCachedFile(key)
      .then((cached) => cached || fetchChunked(key, endpoint, chunkSize))
      .then((filePath) => {
        IMG_CACHE[url] = filePath
        setCachedFile(key, filePath)
        delete PENDING_CACHE[pendingKey]
        return filePath
      })
      .catch((err) => {
        delete PENDING_CACHE[pendingKey]
        console.error('media proxy failed:', err.errMsg || err.message || err)
        return ''
      })
    PENDING_CACHE[pendingKey].then(resolve)
  })
}

function fetchImage(url) { return fetchMedia(url, '/api/media/getImg', IMAGE_CHUNK) }
function fetchVideo(url) { return fetchMedia(url, '/api/media/getVideo', VIDEO_CHUNK) }

async function preloadImages(urls) {
  if (!urls || urls.length === 0) return []
  return Promise.all(urls.map(url => url ? fetchImage(url) : Promise.resolve('')))
}

module.exports = { fetchImage, fetchVideo, preloadImages, getKeyFromUrl }
