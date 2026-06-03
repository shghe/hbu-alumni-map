const IMG_CACHE = {}
const ENV = 'prod-d2gq9dsgy570dcb29'
const SERVICE = 'alumni-api'
const CHUNK = 393216 // 384KB; divisible by 3, so base64 chunks can be concatenated safely.

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

  const ext = key.split('.').pop() || 'jpg'
  const filePath = `${wx.env.USER_DATA_PATH}/cos_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
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

    fetchChunked(key, endpoint)
      .then((filePath) => {
        IMG_CACHE[url] = filePath
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
