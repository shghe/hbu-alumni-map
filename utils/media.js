/**
 * 通过 callContainer 内网拉取图片/视频，存为临时文件——零 COS 外网下行流量
 */
const IMG_CACHE = {}

function getKeyFromUrl(url) {
  if (!url) return ''
  // 从 https://bucket.cos.region.myqcloud.com/homes/xxx.jpg 提取 key
  try {
    const u = new URL(url)
    return u.pathname.slice(1)
  } catch { return url }
}

/**
 * 内网拉取图片，返回临时文件路径
 */
function fetchImage(url) {
  return new Promise((resolve) => {
    if (!url) return resolve('')
    if (IMG_CACHE[url]) return resolve(IMG_CACHE[url])

    const key = getKeyFromUrl(url)
    if (!key) return resolve(url)

    wx.cloud.callContainer({
      config: { env: 'prod-d2gq9dsgy570dcb29' },
      path: '/api/getImg?key=' + encodeURIComponent(key),
      method: 'GET',
      dataType: 'arraybuffer',
      success(res) {
        const ext = key.split('.').pop() || 'jpg'
        const filePath = `${wx.env.USER_DATA_PATH}/img_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
        try {
          wx.getFileSystemManager().writeFileSync(filePath, res.data)
          IMG_CACHE[url] = filePath
          resolve(filePath)
        } catch { resolve(url) }
      },
      fail() { resolve(url) }
    })
  })
}

/**
 * 批量预加载图片
 */
async function preloadImages(urls) {
  if (!urls || urls.length === 0) return urls
  return Promise.all(urls.map(url => url ? fetchImage(url) : Promise.resolve('')))
}

/**
 * 内网拉取视频，返回临时文件路径
 */
function fetchVideo(url) {
  return new Promise((resolve) => {
    if (!url) return resolve('')
    if (IMG_CACHE[url]) return resolve(IMG_CACHE[url])

    const key = getKeyFromUrl(url)
    if (!key) return resolve(url)

    wx.cloud.callContainer({
      config: { env: 'prod-d2gq9dsgy570dcb29' },
      path: '/api/getVideo?key=' + encodeURIComponent(key),
      method: 'GET',
      dataType: 'arraybuffer',
      success(res) {
        const ext = key.split('.').pop() || 'mp4'
        const filePath = `${wx.env.USER_DATA_PATH}/vid_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
        try {
          wx.getFileSystemManager().writeFileSync(filePath, res.data)
          IMG_CACHE[url] = filePath
          resolve(filePath)
        } catch { resolve(url) }
      },
      fail() { resolve(url) }
    })
  })
}

module.exports = { fetchImage, fetchVideo, preloadImages, getKeyFromUrl }
