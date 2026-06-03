const IMG_CACHE = {}
const ENV = 'prod-d2gq9dsgy570dcb29'

function getKeyFromUrl(url) {
  if (!url) return ''
  try { return new URL(url).pathname.slice(1) }
  catch { return url }
}

function fetchMedia(url, endpoint) {
  return new Promise((resolve) => {
    if (!url) return resolve('')
    if (IMG_CACHE[url]) return resolve(IMG_CACHE[url])

    const key = getKeyFromUrl(url)
    if (!key) return resolve('')

    wx.cloud.callContainer({
      config: { env: ENV },
      path: `${endpoint}?key=${encodeURIComponent(key)}`,
      method: 'GET',
      success(res) {
        try {
          // callContainer 返回格式可能是 { data: { code:0, data:"..." } }
          // 也可能是 { code:0, data:"..." } 直接在顶层
          let b64 = null
          if (res.data && typeof res.data === 'object') b64 = res.data.data
          if (!b64 && typeof res.data === 'string') b64 = JSON.parse(res.data).data
          if (!b64) b64 = res.data  // 直接是base64字符串？
          if (!b64 || typeof b64 !== 'string' || b64.length < 10) {
            console.error('invalid response format', typeof res.data, JSON.stringify(res.data).substring(0, 100))
            return resolve('')
          }
          const ext = key.split('.').pop() || 'jpg'
          const fp = `${wx.env.USER_DATA_PATH}/cos_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
          wx.getFileSystemManager().writeFile({
            filePath: fp, data: b64, encoding: 'base64',
            success: () => { IMG_CACHE[url] = fp; resolve(fp) },
            fail: (e) => { console.error('wf fail:', e.errMsg); resolve('') }
          })
        } catch(e) { console.error('ex:', e.message); resolve('') }
      },
      fail(e) { console.error('cc fail:', e.errMsg || JSON.stringify(e)); resolve('') }
    })
  })
}

function fetchImage(url) { return fetchMedia(url, '/api/getImg') }
function fetchVideo(url) { return fetchMedia(url, '/api/getVideo') }

async function preloadImages(urls) {
  if (!urls || urls.length === 0) return urls
  return Promise.all(urls.map(url => url ? fetchImage(url) : Promise.resolve('')))
}

module.exports = { fetchImage, fetchVideo, preloadImages, getKeyFromUrl }
