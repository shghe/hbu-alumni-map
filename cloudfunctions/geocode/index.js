const cloud = require('wx-server-sdk')
const https = require('https')
const http = require('http')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

function request(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http
    mod.get(url, { timeout: 5000 }, (res) => {
      let body = ''
      res.on('data', (chunk) => (body += chunk))
      res.on('end', () => {
        try {
          resolve(JSON.parse(body))
        } catch {
          reject(new Error('parse fail'))
        }
      })
    }).on('error', reject).on('timeout', function () {
      this.destroy()
      reject(new Error('timeout'))
    })
  })
}

exports.main = async (event) => {
  const { latitude, longitude } = event

  // Try Nominatim (free, no key required)
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=zh`
    const result = await request(url)
    if (result && result.address) {
      const addr = result.address
      const city = addr.city || addr.town || addr.county || addr.state_district || addr.state || ''
      const clean = city.replace(/市$/, '')
      return { code: 0, city: clean }
    }
  } catch (e) {
    // fall through
  }

  // Try Tencent Maps (only if KEY env var is set)
  try {
    const key = process.env.TENCENT_MAP_KEY
    if (key) {
      const url = `https://apis.map.qq.com/ws/geocoder/v1/?location=${latitude},${longitude}&key=${key}`
      const result = await request(url)
      if (result.status === 0 && result.result) {
        const addr = result.result.address_component
        const city = (addr.city || '').replace(/市$/, '')
        if (city) return { code: 0, city }
      }
    }
  } catch (e) {
    // fall through
  }

  return { code: 1, message: 'unable to geocode' }
}
