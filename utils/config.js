const APP_VERSION = '1.1.7'
const HTTPS_API_BASE_URL = 'https://api.aluhomemap.top'
const HTTP_API_BASE_URL = 'http://api.aluhomemap.top'
const CLOUD_ENV = 'prod-d2gq9dsgy570dcb29'
const CLOUD_SERVICE = 'alumni-api'
const PUBLIC_CLIENT_KEY = 'hbu-alumni-map-miniapp-v3'

function getEnvVersion() {
  if (typeof wx === 'undefined' || !wx.getAccountInfoSync) return 'release'
  try {
    return wx.getAccountInfoSync().miniProgram.envVersion || 'release'
  } catch (e) {
    return 'release'
  }
}

const API_BASE_URL = HTTPS_API_BASE_URL

module.exports = {
  APP_VERSION,
  API_BASE_URL,
  CLOUD_ENV,
  CLOUD_SERVICE,
  PUBLIC_CLIENT_KEY,
  USE_CLOUD_CONTAINER: !API_BASE_URL
}
