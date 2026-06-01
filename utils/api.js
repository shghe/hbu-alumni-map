/**
 * 微信云托管 API 调用 —— 使用 callContainer，免域名白名单
 */
const ENV = 'prod-d2gq9dsgy570dcb29'
const SERVICE = 'alumni-api'

function request(method, path, data) {
  return new Promise((resolve, reject) => {
    wx.cloud.callContainer({
      config: { env: ENV },
      path,
      method,
      header: { 'X-WX-SERVICE': SERVICE, 'Content-Type': 'application/json' },
      data: method !== 'GET' ? data : undefined,
      success: (res) => {
        if (res.statusCode === 200) resolve(res.data)
        else if (res.statusCode === 401) {
          getApp().globalData.adminToken = ''
          reject(new Error('无权限'))
        } else reject(new Error((res.data && res.data.message) || '请求失败'))
      },
      fail: (err) => reject(err)
    })
  })
}

const api = {
  get: (path, params) => {
    const q = params ? '?' + Object.entries(params).filter(([,v]) => v != null).map(([k,v]) => `${k}=${v}`).join('&') : ''
    return request('GET', path + q)
  },
  post: (path, data) => request('POST', path, data),
  put: (path, data) => request('PUT', path, data),
  del: (path) => request('DELETE', path)
}

module.exports = { api }
