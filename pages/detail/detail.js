const localHomes = require('../../data/homes')
const { api } = require('../../utils/api')
const { uploadFile } = require('../../utils/cos')
const { preloadImages, fetchImage, fetchVideo } = require('../../utils/media')

function formatDate(date) {
  const d = new Date(date)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

Page({
  data: {
    home: { photos: [], services: [] },
    loading: true,
    reviews: [],
    reviewsLoading: true,
    myRating: 0,
    reviewContent: '',
    selectedPhotos: [],
    submitting: false,
    nickname: ''
  },

  onLoad(options) {
    this.homeId = options.id
    this.loadHome(options.id)
    this.loadReviews()
    const nickname = wx.getStorageSync('review_nickname') || ''
    this.setData({ nickname })
  },

  loadHome(id) {
    api.get(`/homes/${id}`).then((res) => {
      if (res.code === 0 && res.data) return this.renderHome(res.data)
      else throw new Error('not found')
    }).catch(() => {
      const local = localHomes.find((h) => String(h.id) === id)
      if (local) {
        this.renderHome(local)
        wx.showToast({ title: '已加载本地数据', icon: 'none' })
      } else {
        wx.showToast({ title: '未找到校友之家', icon: 'none' })
        wx.navigateBack()
      }
    })
  },

  async renderHome(home) {
    const description = home.description || ''
    const [photos, videoPoster, video] = await Promise.all([
      preloadImages(home.photos || []),
      home.videoPoster ? fetchImage(home.videoPoster) : Promise.resolve(''),
      home.video ? fetchVideo(home.video) : Promise.resolve('')
    ])
    this.setData({
      home: {
        ...home,
        id: home._id || home.id,
        photos: photos.filter(Boolean),
        videoPoster,
        video,
        descriptionLines: description.split('\n')
      },
      loading: false
    })
    wx.setNavigationBarTitle({ title: home.city || '校友之家' })
  },

  loadReviews() {
    api.get('/reviews', { homeId: this.homeId }).then(async (res) => {
      if (res.code === 0 && res.data) {
        const reviews = await Promise.all(res.data.map(async (r) => ({
          ...r,
          avatar: r.nickname ? r.nickname.slice(0, 1) : '?',
          createTime: r.createTime || r.created_at ? formatDate(r.createTime || r.created_at) : '',
          photos: (await preloadImages(r.photos || [])).filter(Boolean)
        })))
        this.setData({ reviews, reviewsLoading: false })
      } else { this.setData({ reviewsLoading: false }) }
    }).catch(() => { this.setData({ reviewsLoading: false }) })
  },

  setRating(event) { this.setData({ myRating: Number(event.currentTarget.dataset.rating) }) },
  inputReviewContent(event) { this.setData({ reviewContent: event.detail.value }) },
  inputNickname(event) { const nickname = event.detail.value; this.setData({ nickname }); wx.setStorageSync('review_nickname', nickname) },

  choosePhotos() {
    wx.chooseImage({ count: 6 - this.data.selectedPhotos.length, sizeType: ['compressed'], sourceType: ['album', 'camera'],
      success: (res) => { this.setData({ selectedPhotos: [...this.data.selectedPhotos, ...res.tempFilePaths] }) }
    })
  },

  removePhoto(event) {
    const index = Number(event.currentTarget.dataset.index)
    const photos = [...this.data.selectedPhotos]; photos.splice(index, 1); this.setData({ selectedPhotos: photos })
  },

  async submitReview() {
    const { myRating, reviewContent, selectedPhotos, nickname } = this.data
    if (!nickname.trim()) return wx.showToast({ title: '请输入昵称', icon: 'none' })
    if (!myRating) return wx.showToast({ title: '请给校友之家打分', icon: 'none' })
    if (!reviewContent.trim()) return wx.showToast({ title: '请输入评价内容', icon: 'none' })
    this.setData({ submitting: true })
    try {
      const photoUrls = []
      if (selectedPhotos.length > 0) {
        for (const filePath of selectedPhotos) {
          const suffix = filePath.match(/\.(\w+)$/)?.[1] || 'jpg'
          const key = `reviews/${Date.now()}_${Math.random().toString(36).slice(2)}.${suffix}`
          const url = await uploadFile(filePath, key); photoUrls.push(url)
        }
      }
      const res = await api.post('/reviews', { homeId: this.homeId, nickname: nickname.trim(), rating: myRating, content: reviewContent.trim(), photos: photoUrls })
      if (res.code !== 0) { wx.showToast({ title: res.message || '提交失败', icon: 'none' }) }
      else { wx.showToast({ title: '评价成功' }); this.setData({ myRating: 0, reviewContent: '', selectedPhotos: [], submitting: false }); this.loadReviews() }
    } catch (err) { wx.showToast({ title: '提交失败', icon: 'none' }) }
    this.setData({ submitting: false })
  },

  previewReviewPhoto(event) {
    const { review: rIdx, url } = event.currentTarget.dataset
    const review = this.data.reviews[rIdx]
    if (review && review.photos) wx.previewImage({ current: url, urls: review.photos })
  },

  openLocation() {
    const { home } = this.data
    wx.openLocation({ latitude: Number(home.latitude), longitude: Number(home.longitude), name: home.name, address: home.address, scale: 18 })
  },

  makePhoneCall() {
    const { phone } = this.data.home
    if (!phone) return wx.showToast({ title: '暂无电话', icon: 'none' })
    wx.makePhoneCall({ phoneNumber: phone.replace(/[^\d+]/g, '') })
  },

  copyWechat() { wx.setClipboardData({ data: this.data.home.wechat, success: () => wx.showToast({ title: '微信号已复制', icon: 'none' }) }) },
  copyAddress() { wx.setClipboardData({ data: this.data.home.address, success: () => wx.showToast({ title: '地址已复制', icon: 'none' }) }) },

  previewPhoto(event) {
    const index = Number(event.currentTarget.dataset.index)
    wx.previewImage({ current: this.data.home.photos[index], urls: this.data.home.photos })
  },

  playVideo() {
    const url = this.data.home.video
    if (!url) return
    wx.previewMedia({ sources: [{ url, type: 'video' }], current: 0 })
  },

  onShareAppMessage() {
    return { title: this.data.home.name || '校友之家', path: `/pages/detail/detail?id=${this.homeId}` }
  }
})
