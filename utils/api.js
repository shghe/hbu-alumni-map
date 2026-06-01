/**
 * 统一 API 请求封装
 * 替换所有 wx.cloud.database() 和 wx.cloud.callFunction() 调用
 */

// 云托管服务地址（部署后替换为实际地址）
const API_BASE = 'https://alumni-api-264838-4-1430752917.sh.run.tcloudbase.com/api'

function request(method, path, data, options = {}) {
  return new Promise((resolve, reject) => {
    const header = { 'Content-Type': 'application/json' }

    // 管理员请求带上 JWT token
    if (options.auth) {
      const token = getApp().globalData.adminToken
      if (token) {
        header['Authorization'] = `Bearer ${token}`
      }
    }

    wx.request({
      url: `${API_BASE}${path}`,
      method,
      data,
      header,
      success: (res) => {
        if (res.statusCode === 200) {
          resolve(res.data)
        } else if (res.statusCode === 401) {
          // Token 过期，跳转登录
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

module.exports = {
  API_BASE,
  api
}
