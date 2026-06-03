const IMG_CACHE = {}
const ENV = 'prod-d2gq9dsgy570dcb29'

function getKeyFromUrl(url) {
  if (!url) return ''
  try { return new URL(url).pathname.slice(1) }
  catch { return url }
}

function fetchInternal(path) {
  return new Promise((resolve, reject) => {
    wx.cloud.callContainer({
      config: { env: ENV },
      path,
      method: 'GET',
      dataType: 'arraybuffer',
      success: (res) => resolve(res.data),
      fail: reject
    })
  })
}

function fetchMedia(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(url)
    if (IMG_CACHE[url]) return resolve(IMG_CACHE[url])

    const key = getKeyFromUrl(url)
    if (!key) return resolve(url)

    // 1. 内网拉代理路径
    wx.cloud.callContainer({
      config: { env: ENV },
      path: `/api/getProxyPath?key=${encodeURIComponent(key)}`,
      method: 'GET',
      success(res) {
        if (!res.data || !res.data.downloadUrl) return resolve(url)
        const p = res.data.downloadUrl

        // 2. callContainer 直接拉文件（arraybuffer），写临时文件
        wx.cloud.callContainer({
          config: { env: ENV },
          path: p,
          method: 'GET',
          dataType: 'arraybuffer',
          success(d) {
            if (!d.data || !d.data.byteLength) return resolve(url)
            try {
              const ext = key.split('.').pop() || 'jpg'
              const fp = `${wx.env.USER_DATA_PATH}/dl_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
              wx.getFileSystemManager().writeFile({
                filePath: fp, data: d.data,
                success: () => { IMG_CACHE[url] = fp; resolve(fp) },
                fail: () => resolve(url)
              })
            } catch { resolve(url) }
          },
          fail() { resolve(url) }
        })
      },
      fail(e) { console.error('proxy-fail:', key, e.errMsg || JSON.stringify(e)); resolve(url) }
    })
  })
}

function fetchImage(url) { return fetchMedia(url) }
function fetchVideo(url) { return fetchMedia(url) }

async function preloadImages(urls) {
  if (!urls || urls.length === 0) return urls
  return Promise.all(urls.map(url => url ? fetchImage(url) : Promise.resolve(url)))
}

module.exports = { fetchImage, fetchVideo, preloadImages, getKeyFromUrl }
