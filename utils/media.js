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
        try {
          // 转 base64 data URI，无需写临时文件
          const base64 = wx.arrayBufferToBase64(res.data)
          const ext = key.split('.').pop() || 'jpg'
          const mime = ext === 'png' ? 'image/png' : ext === 'mp4' ? 'video/mp4' : 'image/jpeg'
          const dataUri = `data:${mime};base64,${base64}`
          IMG_CACHE[url] = dataUri
          resolve(dataUri)
        } catch(e) {
          console.error('convert:', e.message)
          resolve(url)
        }
      },
      fail(e) {
        console.error('fetch:', e.errMsg || JSON.stringify(e))
        resolve(url)
      }
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
