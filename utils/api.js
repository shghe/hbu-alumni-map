const { API_BASE_URL, CLOUD_ENV, CLOUD_SERVICE } = require('./config')

function joinUrl(base, path) {
  return base.replace(/\/+$/, '') + '/api' + path
}

function authHeader() {
  try {
    const app = getApp()
    const token = app && app.globalData && app.globalData.adminToken
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch (e) {
    return {}
  }
}

function request(method, path, data) {
  return new Promise((resolve, reject) => {
    const header = { 'Content-Type': 'application/json', ...authHeader() }
    if (API_BASE_URL) {
      wx.request({
        url: joinUrl(API_BASE_URL, path),
        method,
        header,
        data: method !== 'GET' ? data : undefined,
        timeout: 60000,
        success: (res) => resolve(res.data || {}),
        fail: reject
      })
      return
    }

    wx.cloud.callContainer({
      config: { env: CLOUD_ENV, service: CLOUD_SERVICE },
      path: '/api' + path, method,
      header: { ...header, 'X-WX-SERVICE': CLOUD_SERVICE },
      data: method !== 'GET' ? data : undefined,
      timeout: 60000,
      success: (res) => resolve(res.data),
      fail: reject
    })
  })
}

const api = {
  get: (path, params) => {
    const q = params ? '?' + Object.entries(params)
      .filter(([,v]) => v != null)
      .map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&') : ''
    return request('GET', path + q)
  },
  post: (path, data) => request('POST', path, data),
  put: (path, data) => request('PUT', path, data),
  del: path => request('DELETE', path)
}

module.exports = { api }
