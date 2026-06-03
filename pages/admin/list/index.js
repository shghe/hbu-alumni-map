const { api } = require('../../../utils/api')

function formatDate(date) {
  if (!date) return ''
  const d = new Date(date)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

function formatTime(date) {
  if (!date) return ''
  const d = new Date(date)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd} ${hh}:${min}`
}

Page({
  data: {
    authenticated: false,
    myOpenid: '',
    homes: [],
    allReviews: [],
    expandedHome: null,
    homeReviews: [],
    loading: false,
    // Tab
    currentTab: 'homes', // 'homes' | 'logs'
    logs: [],
    logsLoading: false,
    // Custom modal
    modalVisible: false,
    modalTitle: '',
    modalContent: '',
    modalCountdown: 5
  },

  onLoad() {
    this.tryAutoLogin()
  },

  onShow() {
    if (this.data.authenticated) {
      this.loadHomes()
    }
  },

  tryAutoLogin() {
    api.get('/auth/check').then((res) => {
      if (res.code === 0 && res.isAdmin) {
        getApp().globalData.adminToken = res.token
        this.setData({ authenticated: true })
        this.loadHomes()
      } else if (res.code === 0 && res.openid) {
        this.setData({ myOpenid: res.openid })
      }
    }).catch(() => {})
  },

  copyOpenid() {
    const openid = this.data.myOpenid
    if (!openid) return
    wx.setClipboardData({
      data: openid,
      success: () => wx.showToast({ title: '已复制', icon: 'none' })
    })
  },

  loadHomes() {
    this.setData({ loading: true })
    Promise.all([
      api.get('/homes'),
      api.get('/admin/reviews', null)
    ]).then(([homesRes, reviewsRes]) => {
      const homes = (homesRes.data || [])
      const allReviews = (reviewsRes.data || [])
      const countMap = {}
      allReviews.forEach((r) => {
        countMap[r.homeId] = (countMap[r.homeId] || 0) + 1
      })
      homes.forEach((h) => {
        h.reviewCount = countMap[h._id || h.id] || 0
      })
      this.setData({ homes, allReviews, loading: false, expandedHome: null, homeReviews: [] })
    }).catch(() => {
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    })
  },

  toggleReviews(event) {
    const homeId = event.currentTarget.dataset.id
    if (this.data.expandedHome === homeId) {
      this.setData({ expandedHome: null, homeReviews: [] })
      return
    }
    const reviews = this.data.allReviews.filter((r) => r.homeId === homeId)
    this.setData({ expandedHome: homeId, homeReviews: reviews })
  },

  addHome() {
    wx.navigateTo({ url: '/pages/admin/form/index' })
  },

  editHome(event) {
    wx.navigateTo({ url: `/pages/admin/form/index?id=${event.currentTarget.dataset.id}` })
  },

  showConfirm(title, content, callback) {
    this.setData({
      modalVisible: true,
      modalTitle: title,
      modalContent: content,
      modalCountdown: 5
    })
    this._modalConfirm = callback
    this._countdownTimer = setInterval(() => {
      const next = this.data.modalCountdown - 1
      this.setData({ modalCountdown: next })
      if (next <= 0) {
        clearInterval(this._countdownTimer)
        this._countdownTimer = null
      }
    }, 1000)
  },

  hideModal() {
    if (this._countdownTimer) {
      clearInterval(this._countdownTimer)
      this._countdownTimer = null
    }
    this.setData({ modalVisible: false })
    this._modalConfirm = null
  },

  handleModalConfirm() {
    const callback = this._modalConfirm
    this.hideModal()
    if (callback) {
      callback()
    }
  },

  deleteHome(event) {
    const id = event.currentTarget.dataset.id
    const name = event.currentTarget.dataset.name
    this.showConfirm('确认删除', `确定删除「${name}」吗？相关评论也将被删除。`, () => {
      api.del(`/admin/homes/${id}`).then(() => {
        wx.showToast({ title: '已删除' })
        this.loadHomes()
      })
    })
  },

  deleteReview(event) {
    const id = event.currentTarget.dataset.id
    this.showConfirm('确认删除', '确定删除这条评论吗？', () => {
      api.del(`/admin/reviews/${id}`).then(() => {
        wx.showToast({ title: '已删除' })
        this.loadHomes()
      })
    })
  },

  switchTab(event) {
    const tab = event.currentTarget.dataset.tab
    this.setData({ currentTab: tab })
    if (tab === 'logs') this.loadLogs()
  },

  loadLogs() {
    this.setData({ logsLoading: true })
    api.get('/admin/logs', null).then((res) => {
      const logs = (res.data || [])
      logs.forEach((l) => {
        l.createTime = formatTime(l.createTime || l.created_at)
        const labels = { add: '新增', update: '编辑', delete: '删除', deleteReview: '删评' }
        l.actionLabel = labels[l.action] || l.action
      })
      this.setData({ logs, logsLoading: false })
    }).catch(() => {
      this.setData({ logsLoading: false })
      wx.showToast({ title: '加载日志失败', icon: 'none' })
    })
  },

  logout() {
    this.setData({
      authenticated: false,
      homes: [],
      allReviews: [],
      expandedHome: null,
      homeReviews: [],
      logs: []
    })
  }
})
