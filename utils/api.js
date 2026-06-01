const API_BASE = 'https://alumni-api-264838-4-1430752917.sh.run.tcloudbase.com/api'

function request(method, path, data) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE}${path}`,
      method,
      header: { 'Content-Type': 'application/json' },
      data: method !== 'GET' ? data : undefined,
      success: (res) => {
        if (res.statusCode === 200) resolve(res.data)
        else reject(new Error((res.data && res.data.message) || '请求失败'))
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
