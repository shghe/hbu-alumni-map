const API_BASE = 'https://alumni-api-264838-4-1430752917.sh.run.tcloudbase.com/api'
const ADMIN = ['/admin/', '/upload/']

function request(method, path, data) {
  return new Promise((resolve, reject) => {
    const h = { 'Content-Type': 'application/json' }
    if (ADMIN.some(p => path.startsWith(p))) {
      const t = getApp().globalData.adminToken
      if (t) h['Authorization'] = `Bearer ${t}`
    }
    wx.request({
      url: API_BASE + path, method, header: h,
      data: method !== 'GET' ? data : undefined,
      success: r => {
        if (r.statusCode === 200) resolve(r.data)
        else if (r.statusCode === 401) {
          getApp().globalData.adminToken = ''
          reject(new Error('无权限'))
        } else reject(new Error((r.data && r.data.message) || '请求失败'))
      },
      fail: reject
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
  del: path => request('DELETE', path)
}

module.exports = { api }
