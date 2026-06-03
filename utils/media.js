const IMG_CACHE = {}

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
      config: { env: 'prod-d2gq9dsgy570dcb29' },
      path: `${endpoint}?key=${encodeURIComponent(key)}`,
      method: 'GET',
      dataType: 'arraybuffer',
      success(res) {
        const ext = key.split('.').pop() || 'jpg'
        const filePath = `${wx.env.USER_DATA_PATH}/media_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
        try {
          wx.getFileSystemManager().writeFileSync(filePath, res.data)
          IMG_CACHE[url] = filePath
          resolve(filePath)
        } catch(e) { console.error('save:', e.message); resolve(url) }
      },
      fail(e) { console.error('fetch:', JSON.stringify(e)); resolve(url) }
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
