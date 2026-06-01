const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const BASE = 'alumni-api-264838-4-1430752917.sh.run.tcloudbase.com'

exports.main = async (event) => {
  const { method = 'GET', path, data } = event
  const { OPENID } = cloud.getWXContext()
  const https = require('https')

  const options = {
    hostname: BASE,
    path: path,
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-WX-OPENID': OPENID
    }
  }

  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      let body = ''
      res.on('data', c => body += c)
      res.on('end', () => {
        try { resolve(JSON.parse(body)) }
        catch { resolve({ code: 500, message: body.substring(0, 200) }) }
      })
    })
    req.on('error', (e) => resolve({ code: 500, message: e.message }))
    if (method !== 'GET' && data) req.write(JSON.stringify(data))
    req.end()
  })
}
