const { CLOUD_ENV, USE_CLOUD_CONTAINER } = require('./utils/config')

App({
  globalData: { appName: 'HBU校友之家地图', adminToken: '' },
  onLaunch() {
    if (USE_CLOUD_CONTAINER && wx.cloud) wx.cloud.init({ env: CLOUD_ENV })
  }
})
