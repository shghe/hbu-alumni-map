const API_BASE_URL = 'https://api.aluhomemap.top'
const CLOUD_ENV = 'prod-d2gq9dsgy570dcb29'
const CLOUD_SERVICE = 'alumni-api'

module.exports = {
  API_BASE_URL,
  CLOUD_ENV,
  CLOUD_SERVICE,
  USE_CLOUD_CONTAINER: !API_BASE_URL
}
