App({
  globalData: {
    appName: 'HBU校友之家地图',
    adminToken: ''
  },
  onLaunch() {
    wx.cloud.init({ env: 'prod-d2gq9dsgy570dcb29' })
  }
})
