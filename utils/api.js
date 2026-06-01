/**
 * 统一 API 请求封装
 * 使用 wx.cloud.callContainer —— 免域名白名单，自动注入 openid
 */

const ENV_ID = 'prod-d2gq9dsgy570dcb29'
const SERVICE = 'alumni-api'

function request(method, path, data, options = {}) {
  return new Promise((resolve, reject) => {
    wx.cloud.callContainer({
      config: { env: ENV_ID },
      path,
      method,
      header: {
        'Content-Type': 'application/json',
        'X-WX-SERVICE': SERVICE
      },
      data,
      success: (res) => {
        if (res.statusCode === 200) {
          resolve(res.data)
        } else if (res.statusCode === 401) {
          getApp().globalData.adminToken = ''
          reject(new Error('登录已过期'))
        } else {
          reject(new Error((res.data && res.data.message) || '请求失败'))
        }
      },
      fail: (err) => {
        reject(err)
      }
    })
  })
}

const api = {
  get: (path, params, opts) => {
    const query = params ? '?' + Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&') : ''
    return request('GET', path + query, undefined, opts)
  },
  post: (path, data, opts) => request('POST', path, data, opts),
  put: (path, data, opts) => request('PUT', path, data, opts),
  del: (path, opts) => request('DELETE', path, undefined, opts)
}

module.exports = { api, ENV_ID, SERVICE }
