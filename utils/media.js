const IMG_CACHE = {}
const PENDING_CACHE = {}
const { API_BASE_URL, CLOUD_ENV, CLOUD_SERVICE } = require('./config')
const IMAGE_CHUNK = 393216 // 384KB; divisible by 3, so base64 chunks can be concatenated safely.
const VIDEO_CHUNK = 688128 // 672KB; keeps base64 JSON below the 1MB-ish callContainer response ceiling.
const CACHE_KEY = 'media_file_cache_v1'

function isLocalFile(url) {
  return /^wxfile:\/\//.test(url) || /^http:\/\/tmp\//.test(url) || /^http:\/\/usr\//.test(url) || /^\/assets\//.test(url)
}

function isHttpUrl(url) {
  return /^https?:\/\//.test(url)
}

function isCosHost(hostname) {
  return /\.cos\.[^.]+\.myqcloud\.com$/.test(hostname) || hostname.includes('.cos-internal.')
}

function isProxyUrl(url) {
  if (!isHttpUrl(url)) return false
  try {
    const parsed = new URL(url)
    return !isCosHost(parsed.hostname)
  } catch (e) {
    return false
  }
}

function isProxyPath(url) {
  return /^\/api\/media\/stream\?/.test(url)
}

function toAbsoluteApiUrl(path) {
  if (!API_BASE_URL || !path) return path || ''
  return `${API_BASE_URL.replace(/\/+$/, '')}${path}`
}

function getKeyFromUrl(url) {
  if (!url || isLocalFile(url)) return ''
  if (/^(homes|reviews)\//.test(url)) return url

  try {
    const parsed = new URL(url)
    if (parsed.pathname === '/api/media/stream') {
      const key = parsed.searchParams.get('key') || ''
      return normalizeKey(key)
    }
    if (!isCosHost(parsed.hostname)) {
      return ''
    }
    let key = parsed.pathname.slice(1)
    try { key = decodeURIComponent(key) } catch (e) {}
    return normalizeKey(key.split('?')[0])
  } catch (e) {
    return ''
  }
}

function normalizeKey(key) {
  if (!key) return ''
  const value = String(key).replace(/^\/+/, '')
  return /^(homes|reviews)\//.test(value) && !value.includes('..') ? value : ''
}

function streamUrlForKey(key) {
  if (!API_BASE_URL || !key) return ''
  return `${API_BASE_URL.replace(/\/+$/, '')}/api/media/stream?key=${encodeURIComponent(key)}`
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
      config: { env: CLOUD_ENV, service: CLOUD_SERVICE },
      path,
      method: 'GET',
      header: { 'X-WX-SERVICE': CLOUD_SERVICE },
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
    if (isProxyPath(url)) return resolve(toAbsoluteApiUrl(url))
    if (isProxyUrl(url)) return resolve(url)
    if (IMG_CACHE[url]) return resolve(IMG_CACHE[url])

    const key = getKeyFromUrl(url)
    if (!key) return resolve(url)
    const streamUrl = streamUrlForKey(key)
    if (streamUrl) return resolve(streamUrl)

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

// Download a network URL to local file for preview (reuse cache)
function downloadToLocal(networkUrl, key) {
  return new Promise(async (resolve) => {
    if (!networkUrl || !key) return resolve(networkUrl)
    // Check disk cache
    const cached = await getCachedFile(key)
    if (cached) return resolve(cached)
    // Download to local
    const localPath = localPathForKey(key)
    wx.downloadFile({
      url: networkUrl,
      success: (res) => {
        if (res.statusCode === 200) {
          try {
            const fs = wx.getFileSystemManager()
            fs.saveFileSync(res.tempFilePath, localPath)
          } catch (e) {
            // fallback to temp file
            return resolve(res.tempFilePath)
          }
          setCachedFile(key, localPath)
          resolve(localPath)
        } else {
          resolve(networkUrl)
        }
      },
      fail: () => resolve(networkUrl)
    })
  })
}

// Ensure an image URL is cached locally and return the local path for preview
async function ensureLocalForPreview(networkUrl) {
  if (!networkUrl || isLocalFile(networkUrl)) return networkUrl
  const key = getKeyFromUrl(networkUrl) || networkUrl.replace(/[^\w.-]/g, '_')
  return downloadToLocal(networkUrl, key)
}

// Get cached local path only (don't download if not cached)
async function getCachedPreview(networkUrl) {
  if (!networkUrl || isLocalFile(networkUrl)) return networkUrl
  const key = getKeyFromUrl(networkUrl) || networkUrl.replace(/[^\w.-]/g, '_')
  const cached = await getCachedFile(key)
  return cached || networkUrl
}

// Download to cache in background (fire and forget)
function cacheInBackground(networkUrl, key) {
  if (!networkUrl || !key) return
  getCachedFile(key).then(cached => {
    if (cached) return // already cached
    wx.downloadFile({
      url: networkUrl,
      success: (res) => {
        if (res.statusCode === 200) {
          const localPath = localPathForKey(key)
          try {
            wx.getFileSystemManager().saveFileSync(res.tempFilePath, localPath)
          } catch (e) { return }
          setCachedFile(key, localPath)
        }
      },
      fail: () => {}
    })
  })
}

module.exports = { fetchImage, fetchVideo, preloadImages, getKeyFromUrl, downloadToLocal, ensureLocalForPreview, getCachedPreview, cacheInBackground, getCachedFile }
