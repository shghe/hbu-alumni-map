const CHINA_CITIES = require('../../../data/china-cities')
const PROVINCES = CHINA_CITIES.map(p => p.province)
const DEFAULT_PROVINCE_IDX = PROVINCES.indexOf('河北省')
const DEFAULT_CITIES = CHINA_CITIES[DEFAULT_PROVINCE_IDX >= 0 ? DEFAULT_PROVINCE_IDX : 0].cities
const { api } = require('../../../utils/api')
const { uploadFile, isTempFile } = require('../../../utils/cos')
const { preloadImages, fetchImage } = require('../../../utils/media')

const app = getApp()

// Find which province a city belongs to
function findProvince(city) {
  for (const p of CHINA_CITIES) {
    if (p.cities.includes(city)) return p.province
  }
  return '河北省' // fallback
}

Page({
  data: {
    isEdit: false,
    homeId: '',
    saving: false,
    form: {
      name: '',
      province: PROVINCES[DEFAULT_PROVINCE_IDX],
      city: DEFAULT_CITIES[0],
      latitude: '',
      longitude: '',
      address: '',
      contactName: '',
      phone: '',
      wechat: '',
      hours: '',
      services: [],
      description: '',
      video: '',
      videoPoster: '',
      photos: []
    },
    newService: '',
    photoPreviews: [],
    videoPosterPreview: '',
    // Province-city dual picker
    provinces: PROVINCES,
    provinceIndex: DEFAULT_PROVINCE_IDX,
    cityList: DEFAULT_CITIES,
    cityIndex: 0
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ isEdit: true, homeId: options.id })
      this.loadHome(options.id)
    }
  },

  goBack() {
    wx.navigateBack()
  },

  loadHome(id) {
    api.get(`/homes/${id}`).then((res) => {
      if (!res.data) throw new Error('not found')
      const h = res.data
      const city = h.city || '保定'
      const province = h.province || findProvince(city)
      const pIdx = PROVINCES.indexOf(province)
      const provinceIndex = pIdx >= 0 ? pIdx : 0
      const cityList = CHINA_CITIES[provinceIndex].cities
      const cIdx = cityList.indexOf(city)
      const cityIndex = cIdx >= 0 ? cIdx : 0
      const photos = h.photos || []
      const videoPoster = h.videoPoster || ''
      this.setData({
        form: {
          name: h.name || '',
          province,
          city,
          latitude: String(h.latitude || ''),
          longitude: String(h.longitude || ''),
          address: h.address || '',
          contactName: h.contactName || '',
          phone: h.phone || '',
          wechat: h.wechat || '',
          hours: h.hours || '',
          services: h.services || [],
          description: h.description || '',
          video: h.video || '',
          videoPoster,
          photos: h.photos || []
        },
        provinceIndex,
        cityList,
        cityIndex,
        photoPreviews: [],
        videoPosterPreview: ''
      })
      this.refreshMediaPreviews(photos, videoPoster)
    }).catch(() => {
      wx.showToast({ title: '加载失败', icon: 'none' })
    })
  },

  async refreshMediaPreviews(photos, videoPoster) {
    const [photoPreviews, videoPosterPreview] = await Promise.all([
      preloadImages(photos || []),
      videoPoster ? fetchImage(videoPoster) : Promise.resolve('')
    ])
    this.setData({
      photoPreviews: photoPreviews.map((preview, index) => preview || (photos || [])[index]).filter(Boolean),
      videoPosterPreview: videoPosterPreview || videoPoster || ''
    })
  },

  onField(event) {
    const field = event.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: event.detail.value })
  },

  onProvinceChange(event) {
    const idx = Number(event.detail.value)
    const cityList = CHINA_CITIES[idx].cities
    this.setData({
      provinceIndex: idx,
      cityList,
      cityIndex: 0,
      'form.province': PROVINCES[idx],
      'form.city': cityList[0]
    })
  },

  onCityChange(event) {
    const idx = Number(event.detail.value)
    this.setData({
      cityIndex: idx,
      'form.city': CHINA_CITIES[this.data.provinceIndex].cities[idx]
    })
  },

  chooseLocation() {
    wx.chooseLocation({
      success: (res) => {
        console.log('chooseLocation result:', res)
        this.setData({
          'form.latitude': String(res.latitude),
          'form.longitude': String(res.longitude)
        })
      },
      fail: (err) => {
        console.error('chooseLocation failed', err)
        wx.showToast({ title: '选择位置失败: ' + (err.errMsg || '未知错误'), icon: 'none' })
      }
    })
  },

  inputService(event) {
    this.setData({ newService: event.detail.value })
  },

  addService() {
    const tag = this.data.newService.trim()
    if (!tag) return
    if (this.data.form.services.includes(tag)) {
      wx.showToast({ title: '标签已存在', icon: 'none' })
      return
    }
    this.setData({
      'form.services': [...this.data.form.services, tag],
      newService: ''
    })
  },

  removeService(event) {
    const index = Number(event.currentTarget.dataset.index)
    const services = [...this.data.form.services]
    services.splice(index, 1)
    this.setData({ 'form.services': services })
  },

  choosePhotos() {
    wx.chooseImage({
      count: 10 - this.data.form.photos.length,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const photos = [...this.data.form.photos, ...res.tempFilePaths]
        const photoPreviews = [...this.data.photoPreviews, ...res.tempFilePaths]
        this.setData({ 'form.photos': photos, photoPreviews })
      }
    })
  },

  removePhoto(event) {
    const index = Number(event.currentTarget.dataset.index)
    const photos = [...this.data.form.photos]
    const photoPreviews = [...this.data.photoPreviews]
    photos.splice(index, 1)
    photoPreviews.splice(index, 1)
    this.setData({ 'form.photos': photos, photoPreviews })
  },

  choosePoster() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this.setData({ 'form.videoPoster': res.tempFilePaths[0], videoPosterPreview: res.tempFilePaths[0] })
      }
    })
  },

  removePoster() {
    this.setData({ 'form.videoPoster': '', videoPosterPreview: '' })
  },

  chooseVideo() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['video'],
      sourceType: ['album', 'camera'],
      maxDuration: 120,
      success: (res) => {
        const video = res.tempFiles[0]
        wx.showLoading({ title: '压缩中...' })
        wx.compressVideo({
          src: video.tempFilePath,
          quality: 'medium',
          success: (compressRes) => {
            wx.hideLoading()
            this.setData({
              'form.video': compressRes.tempFilePath,
              'form.videoName': video.name || `视频_${Date.now()}`
            })
          },
          fail: () => {
            wx.hideLoading()
            this.setData({
              'form.video': video.tempFilePath,
              'form.videoName': video.name || `视频_${Date.now()}`
            })
          }
        })
      }
    })
  },

  removeVideo() {
    this.setData({ 'form.video': '', 'form.videoName': '' })
  },

  async save() {
    const { form, isEdit, homeId } = this.data

    // Validate
    if (!form.name.trim()) {
      wx.showToast({ title: '请输入名称', icon: 'none' })
      return
    }
    if (!form.latitude || !form.longitude) {
      wx.showToast({ title: '请在地图上选择位置', icon: 'none' })
      return
    }

    this.setData({ saving: true })

    console.log('Saving form data:', {
      name: form.name,
      city: form.city,
      latitude: form.latitude,
      longitude: form.longitude,
      address: form.address
    })

    try {
      // 上传新照片到 COS
      const photos = []
      for (const photo of form.photos) {
        if (isTempFile(photo)) {
          const suffix = photo.match(/\.(\w+)$/)?.[1] || 'jpg'
          const key = `homes/${Date.now()}_${Math.random().toString(36).slice(2)}.${suffix}`
          const url = await uploadFile(photo, key)
          photos.push(url)
        } else {
          photos.push(photo)
        }
      }

      // 上传封面图
      let videoPoster = form.videoPoster
      if (isTempFile(videoPoster)) {
        const suffix = videoPoster.match(/\.(\w+)$/)?.[1] || 'jpg'
        const key = `homes/poster_${Date.now()}.${suffix}`
        videoPoster = await uploadFile(videoPoster, key)
      }

      // 上传视频
      let video = form.video
      if (isTempFile(video)) {
        const suffix = video.match(/\.(\w+)$/)?.[1] || 'mp4'
        const key = `homes/video_${Date.now()}.${suffix}`
        video = await uploadFile(video, key)
      }

      const data = {
        name: form.name.trim(),
        city: form.city,
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        address: form.address,
        contactName: form.contactName,
        phone: form.phone,
        wechat: form.wechat,
        hours: form.hours,
        services: form.services,
        description: form.description,
        video,
        videoPoster,
        photos
      }

      if (isEdit) {
        data.id = homeId
      }

      let res
      if (isEdit) {
        res = await api.put(`/admin/homes/${homeId}`, data)
      } else {
        res = await api.post('/admin/homes', data)
      }

      if (res.code === 0) {
        wx.showToast({ title: isEdit ? '已更新' : '已添加' })
        setTimeout(() => wx.navigateBack(), 1200)
      } else {
        wx.showToast({ title: res.message || '保存失败', icon: 'none' })
      }
    } catch (err) {
      console.error('保存失败', err)
      wx.showToast({ title: '保存失败', icon: 'none' })
    }

    this.setData({ saving: false })
  }
})
