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
    if (!key) return resolve(url)

    wx.cloud.callContainer({
      config: { env: ENV },
      path: `${endpoint}?key=${encodeURIComponent(key)}`,
      method: 'GET',
      dataType: 'arraybuffer',
      success(res) {
        if (!res.data || !res.data.byteLength) return resolve(url)
        const ext = key.split('.').pop() || 'jpg'
        const fp = `${wx.env.USER_DATA_PATH}/cos_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
        wx.getFileSystemManager().writeFile({
          filePath: fp, data: res.data,
          success: () => { IMG_CACHE[url] = fp; resolve(fp) },
          fail: () => resolve(url)
        })
      },
      fail() { resolve(url) }
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
