const IMG_CACHE = {}
const ENV = 'prod-d2gq9dsgy570dcb29'

function getKeyFromUrl(url) {
  if (!url) return ''
  try { return new URL(url).pathname.slice(1) }
  catch { return url }
}

function fetchMedia(url) {
  return new Promise((resolve) => {
    if (!url) return resolve('')
    if (IMG_CACHE[url]) return resolve(IMG_CACHE[url])

    const key = getKeyFromUrl(url)
    if (!key) return resolve(url)

    // 1. 通过 callContainer 获取代理下载路径
    wx.cloud.callContainer({
      config: { env: ENV },
      path: `/api/getProxyPath?key=${encodeURIComponent(key)}`,
      method: 'GET',
      success(res) {
        if (!res.data || !res.data.downloadUrl) return resolve(url)
        const downloadUrl = res.data.downloadUrl

        // 2. wx.downloadFile 拉到本地临时文件
        wx.cloud.callContainer({
          config: { env: ENV },
          path: downloadUrl,
          method: 'GET',
          dataType: 'filePath',
          success(d) {
            if (d.filePath) {
              IMG_CACHE[url] = d.filePath
              resolve(d.filePath)
            } else {
              resolve(url)
            }
          },
          fail() { resolve(url) }
        })
      },
      fail() { resolve(url) }
    })
  })
}

function fetchImage(url) { return fetchMedia(url) }
function fetchVideo(url) { return fetchMedia(url) }

async function preloadImages(urls) {
  if (!urls || urls.length === 0) return urls
  return Promise.all(urls.map(url => url ? fetchImage(url) : Promise.resolve('')))
}

module.exports = { fetchImage, fetchVideo, preloadImages, getKeyFromUrl }
