App({
  globalData: {
    appName: '河北大学校友地图',
    adminPassword: ''
  },
  onLaunch() {
    wx.cloud.init({
      env: 'cloud1-d7gxbwt5z89029dd1'
    })
  }
})
