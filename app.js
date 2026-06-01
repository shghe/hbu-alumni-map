App({
  globalData: {
    appName: 'HBU校友之家地图',
    adminToken: ''
  },
  onLaunch() {
    wx.cloud.init({ env: 'cloud1-d7gxbwt5z89029dd1' })
  }
})
