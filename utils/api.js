const API_BASE = 'https://alumni-api-264838-4-1430752917.sh.run.tcloudbase.com/api'

function request(method, path, data) {
  return new Promise((resolve, reject) => {
    const header = { 'Content-Type': 'application/json' }
    const token = getApp().globalData.adminToken
    if (token) header['Authorization'] = `Bearer ${token}`

    wx.request({
      url: `${API_BASE}${path}`,
      method,
      header,
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

module.exports = { api, API_BASE }
