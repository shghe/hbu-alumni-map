const IMG_CACHE = {}
const ENV = 'prod-d2gq9dsgy570dcb29'
const SERVICE = 'alumni-api'
const CHUNK = 393216 // 384KB; divisible by 3, so base64 chunks can be concatenated safely.
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

async function fetchChunked(key, endpoint) {
  const chunks = []
  let offset = 0
  let total = Infinity

  while (offset < total) {
    const res = await callMedia(`${endpoint}?key=${encodeURIComponent(key)}&offset=${offset}&size=${CHUNK}`)
    if (!res || res.code !== 0 || !res.data || !res.size) throw new Error((res && res.message) || 'empty chunk')

    chunks.push(res.data)
    total = Number(res.total) || 0
    offset += Number(res.size) || 0
    if (!total || res.size < CHUNK) break
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

function fetchMedia(url, endpoint) {
  return new Promise((resolve) => {
    if (!url) return resolve('')
    if (IMG_CACHE[url]) return resolve(IMG_CACHE[url])

    const key = getKeyFromUrl(url)
    if (!key) return resolve(url)

    getCachedFile(key)
      .then((cached) => cached || fetchChunked(key, endpoint))
      .then((filePath) => {
        IMG_CACHE[url] = filePath
        setCachedFile(key, filePath)
        resolve(filePath)
      })
      .catch((err) => {
        console.error('media proxy failed:', err.errMsg || err.message || err)
        resolve('')
      })
  })
}

function fetchImage(url) { return fetchMedia(url, '/api/media/getImg') }
function fetchVideo(url) { return fetchMedia(url, '/api/media/getVideo') }

async function preloadImages(urls) {
  if (!urls || urls.length === 0) return []
  return Promise.all(urls.map(url => url ? fetchImage(url) : Promise.resolve('')))
}

module.exports = { fetchImage, fetchVideo, preloadImages, getKeyFromUrl }
