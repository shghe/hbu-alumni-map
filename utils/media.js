const IMG_CACHE = {}
const ENV = 'prod-d2gq9dsgy570dcb29'
// 内网域名——用于 wx.downloadFile
const INTERNAL_HOST = 'ymbxltaa.alumni-api.45u5912m.kwecopnf.com'

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
    if (!key) return resolve(url)  // 非COS URL保留原始

    // 1. callContainer 拿代理路径
    wx.cloud.callContainer({
      config: { env: ENV },
      path: '/api/getProxyPath?key=' + encodeURIComponent(key),
      method: 'GET',
      success(res) {
        const downloadUrl = (res.data && res.data.downloadUrl)
        if (!downloadUrl) return resolve(url)

        // 2. wx.downloadFile 拉到本地
        wx.downloadFile({
          url: 'https://' + INTERNAL_HOST + downloadUrl,
          success(d) {
            if (d.tempFilePath) {
              IMG_CACHE[url] = d.tempFilePath
              resolve(d.tempFilePath)
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
