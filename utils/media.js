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

    // 先测试 /api/ping 小图片验证链路
    const testPath = '/api/ping'

    wx.cloud.callContainer({
      config: { env: ENV },
      path: testPath,
      method: 'GET',
      success(res) {
        try {
          console.log('ping res:', JSON.stringify(res.data).substring(0, 200))
          const b64 = (res.data && res.data.data) ? res.data.data : ''
          if (!b64 || b64.length < 10) { console.error('no data'); return resolve('') }
          const ext = key.split('.').pop() || 'jpg'
          const fp = `${wx.env.USER_DATA_PATH}/test_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
          wx.getFileSystemManager().writeFile({
            filePath: fp, data: b64, encoding: 'base64',
            success: () => { IMG_CACHE[url] = fp; resolve(fp) },
            fail: (e) => { console.error('wf:', e.errMsg); resolve('') }
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
