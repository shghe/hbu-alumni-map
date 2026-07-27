const localHomes = require('../../data/homes')
const { api } = require('../../utils/api')
const { fetchImage, fetchVideo, cacheInBackground, downloadImmediate, getCachedPreview, getKeyFromUrl, pauseDownloads, resumeDownloads } = require('../../utils/media')

const REST_PHOTO_BATCH_SIZE = 2
const REST_PHOTO_BATCH_DELAY = 250

Page({
  data: {
    home: { photos: [], services: [] },
    loading: true,
  },

  onLoad(options) {
    this.homeId = options.id
    resumeDownloads()
    this.loadHome(options.id)
  },

  onUnload() {
    pauseDownloads()
    if (this._restPhotoTimer) {
      clearTimeout(this._restPhotoTimer)
      this._restPhotoTimer = null
    }
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
    const photoKeys = home.photos || []
    const videoPosterKey = home.videoPoster || ''
    const videoKey = home.video || ''
    // Compute full preview URLs from all keys upfront (before async loading)
    const API_BASE = 'https://api.aluhomemap.top'
    const photoPreviews = photoKeys.map(k => {
      if (!k) return ''
      if (/^https?:\/\//.test(k) || /^wxfile:\/\//.test(k)) return k
      if (/^\/api\//.test(k)) return API_BASE + k
      return k
    })
    this.setData({
      home: {
        ...home,
        id: home._id || home.id,
        photos: [],
        photoKeys,
        photoPreviews,
        videoPoster: '',
        videoPosterKey,
        video: '',
        videoKey,
        hasVideo: Boolean(videoKey),
        descriptionLines: description.split('\n')
      },
      loading: false
    })
    wx.setNavigationBarTitle({ title: home.city || '校友之家' })
    if (this._restPhotoTimer) {
      clearTimeout(this._restPhotoTimer)
      this._restPhotoTimer = null
    }
    this.loadHeroMedia(photoKeys, videoPosterKey)
  },

  async loadHeroMedia(photoKeys, videoPosterKey) {
    const firstPhotoPromise = photoKeys[0] ? fetchImage(photoKeys[0]) : Promise.resolve('')
    firstPhotoPromise.then((firstPhoto) => {
      if (firstPhoto) this.setData({ 'home.photos': [firstPhoto] })
      this.prefetchVideo()
    })

    if (videoPosterKey) {
      fetchImage(videoPosterKey).then((videoPoster) => {
        if (videoPoster) this.setData({ 'home.videoPoster': videoPoster })
      })
    }

    try {
      const firstPhoto = await firstPhotoPromise
      this.loadRestPhotos(photoKeys.slice(1), firstPhoto ? [firstPhoto] : [])
    } catch (err) {
      console.error('load media failed:', err.errMsg || err.message || err)
      this.loadRestPhotos(photoKeys.slice(1), [])
    }
  },

  loadRestPhotos(photoKeys, loadedPhotos) {
    if (!photoKeys.length) return
    const batches = []
    for (let i = 0; i < photoKeys.length; i += REST_PHOTO_BATCH_SIZE) {
      batches.push(photoKeys.slice(i, i + REST_PHOTO_BATCH_SIZE))
    }

    const loadBatch = async () => {
      const batch = batches.shift()
      if (!batch) return
      const photos = await Promise.all(batch.map(url => fetchImage(url).catch(() => '')))
      loadedPhotos.push(...photos.filter(Boolean))
      this.setData({ 'home.photos': loadedPhotos })
      // Cache to local storage in background for instant preview later
      this.cachePhotosInBackground(loadedPhotos)
      if (batches.length) {
        this._restPhotoTimer = setTimeout(loadBatch, REST_PHOTO_BATCH_DELAY)
      }
    }

    this._restPhotoTimer = setTimeout(loadBatch, REST_PHOTO_BATCH_DELAY)
  },

  cachePhotosInBackground(photos) {
    photos.forEach(url => {
      const urlObj = url && url.match(/\/api\/media\/stream\?key=([^&]+)/)
      if (urlObj) cacheInBackground(url, decodeURIComponent(urlObj[1]))
    })
  },

  prefetchVideo() {
    const { video, videoKey } = this.data.home
    if (video || !videoKey) return
    fetchVideo(videoKey).then((url) => {
      if (url) this.setData({ 'home.video': url })
    })
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

  copyWechat() {
    const wechat = this.data.home.wechat || ''
    if (!wechat) return wx.showToast({ title: '暂无微信号', icon: 'none' })
    wx.setClipboardData({ data: wechat, success: () => wx.showToast({ title: '微信号已复制', icon: 'none' }) })
  },
  copyAddress() {
    const address = this.data.home.address || ''
    if (!address) return wx.showToast({ title: '暂无地址', icon: 'none' })
    wx.setClipboardData({ data: address, success: () => wx.showToast({ title: '地址已复制', icon: 'none' }) })
  },

  previewPhoto(event) {
    const index = Number(event.currentTarget.dataset.index)
    const urls = this.data.home.photoPreviews.map(u => getCachedPreview(u))
    wx.previewImage({ current: urls[index], urls })
  },

  async playVideo() {
    const { video, videoKey } = this.data.home
    let url = video
    if (!url && !videoKey) return wx.showToast({ title: '视频加载失败', icon: 'none' })
    wx.showLoading({ title: '加载视频...' })
    if (!url) {
      url = await fetchVideo(videoKey)
      if (url) this.setData({ 'home.video': url })
    }
    if (!url) { wx.hideLoading(); return wx.showToast({ title: '视频加载失败', icon: 'none' }) }
    const localUrl = getCachedPreview(url)
    wx.hideLoading()
    // If not cached yet, download immediately alongside playback (bypass queue)
    if (localUrl === url) {
      const key = getKeyFromUrl(url)
      if (key) downloadImmediate(url, key)
    }
    wx.previewMedia({ sources: [{ url: localUrl, type: 'video' }], current: 0 })
  },

  onShareAppMessage() {
    return { title: this.data.home.name || '校友之家', path: `/pages/detail/detail?id=${this.homeId}` }
  }
})
