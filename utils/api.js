/**
 * 统一 API 请求封装
 * 通过代理云函数转发到云托管，不需要域名白名单
 */

function request(method, path, data) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'api-proxy',
      data: { method, path, data }
    }).then((res) => {
      if (res.result && res.result.code !== undefined) {
        resolve(res.result)
      } else {
        reject(new Error('请求失败'))
      }
    }).catch((err) => {
      reject(err)
    })
  })
}

const api = {
  get: (path, params) => {
    const query = params ? '?' + Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&') : ''
    return request('GET', path + query)
  },
  post: (path, data) => request('POST', path, data),
  put: (path, data) => request('PUT', path, data),
  del: (path) => request('DELETE', path)
}

module.exports = { api }
