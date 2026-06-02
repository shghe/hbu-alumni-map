const localHomes = require('../../data/homes')
const { api } = require('../../utils/api')

const CITIES = ['保定', '北京', '石家庄', '雄安', '唐山', '秦皇岛', '邯郸', '邢台', '张家口', '承德', '沧州', '廊坊', '衡水']

const CITY_COORDS = {
  '保定': { latitude: 38.8749, longitude: 115.5222 },
  '北京': { latitude: 39.9042, longitude: 116.4074 },
  '石家庄': { latitude: 38.0455, longitude: 114.5020 },
  '雄安': { latitude: 38.9637, longitude: 115.9311 },
  '唐山': { latitude: 39.6309, longitude: 118.1804 },
  '秦皇岛': { latitude: 39.9254, longitude: 119.5996 },
  '邯郸': { latitude: 36.6256, longitude: 114.5391 },
  '邢台': { latitude: 37.0708, longitude: 114.5619 },
  '张家口': { latitude: 40.7679, longitude: 114.8863 },
  '承德': { latitude: 40.9513, longitude: 117.9634 },
  '沧州': { latitude: 38.3044, longitude: 116.8388 },
  '廊坊': { latitude: 39.5183, longitude: 116.6871 },
  '衡水': { latitude: 37.7389, longitude: 115.6862 }
}

const DEFAULT_CENTER = CITY_COORDS['保定']

function toRadians(value) {
  return (value * Math.PI) / 180
}

function getDistanceKm(from, to) {
  const radius = 6371
  const deltaLatitude = toRadians(to.latitude - from.latitude)
  const deltaLongitude = toRadians(to.longitude - from.longitude)
  const startLatitude = toRadians(from.latitude)
  const endLatitude = toRadians(to.latitude)
  const a =
    Math.sin(deltaLatitude / 2) * Math.sin(deltaLatitude / 2) +
    Math.cos(startLatitude) *
      Math.cos(endLatitude) *
      Math.sin(deltaLongitude / 2) *
      Math.sin(deltaLongitude / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return radius * c
}

function formatDistance(distance) {
  if (!distance && distance !== 0) {
    return ''
  }
  return distance < 1 ? `${Math.round(distance * 1000)}m` : `${distance.toFixed(1)}km`
}

// Offset map center southward so the user location marker appears in the visible upper portion,
// rather than behind the bottom panel. Offset scales with the map zoom level.
function offsetCenterForPanel(userLocation, scale) {
  const baseOffset = 0.058 // degrees at scale 12 (~6.4km south to clear the bottom panel)
  const scaleFactor = Math.pow(2, 12 - scale)
  return {
    latitude: userLocation.latitude - baseOffset * scaleFactor,
    longitude: userLocation.longitude
  }
}

Page({
  data: {
    allHomes: [],
    visibleHomes: [],
    markers: [],
    serviceOptions: [],
    selectedService: '全部',
    keyword: '',
    center: DEFAULT_CENTER,
    scale: 11,
    showUserLocation: false,
    trafficEnabled: false,
    userLocation: null,
    loading: true,
    cities: [],
    selectedCity: '',
    cityIndex: 0,
  },

  onLoad() {
    this.requestLocation()
  },

  requestLocation() {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        const userLocation = { latitude: res.latitude, longitude: res.longitude }
        this.setData({
          userLocation,
          center: offsetCenterForPanel(userLocation, 12),
          showUserLocation: true,
          scale: 12
        })
        this.loadAllHomes(userLocation)
      },
      fail: (err) => {
        console.warn('定位失败', err)
        wx.getSetting({
          success: (settingRes) => {
            if (!settingRes.authSetting['scope.userLocation']) {
              wx.showModal({
                title: '需要位置权限',
                content: '校友地图需要获取你的位置信息，以便显示附近的校友之家。请前往设置开启位置权限。',
                confirmText: '去设置',
                success: (modalRes) => {
                  if (modalRes.confirm) {
                    wx.openSetting()
                  }
                }
              })
            }
          }
        })
        this.loadAllHomes(null)
      }
    })
  },

  onShow() {
    if (!this.data.loading) {
      const loc = this.data.userLocation
      this.loadAllHomes(loc)
    }
  },

  loadAllHomes(userLocation) {
    this.setData({ loading: true })
    api.get('/homes').then((res) => {
      if (res.code === 0 && res.data) {
        const homes = res.data.map((home) => ({
          ...home,
          dbId: home.dbId || String(home.id)
        }))
        this.initHomes(homes, userLocation)
      } else {
        this.fallbackToLocal(userLocation)
      }
    }).catch((err) => {
      console.error('API请求失败:', JSON.stringify(err))
      this.fallbackToLocal(userLocation)
    })
  },

  selectCityByName(city) {
    const { cities } = this.data
    const index = cities.indexOf(city)
    if (index === -1) return
    this.setData({ selectedCity: city, cityIndex: index, keyword: '', selectedService: '全部' })
    this.filterVisibleHomes()
  },

  fallbackToLocal(userLocation) {
    console.warn('降级到本地数据')
    const homes = localHomes.map((home) => ({
      ...home,
      dbId: String(home.id)
    }))
    this.initHomes(homes, userLocation)
    wx.showToast({ title: '已加载本地数据', icon: 'none' })
  },

  initHomes(homes, userLocation) {
    const citySet = [...new Set(homes.map(h => h.city).filter(Boolean))]
    const knownCities = CITIES.filter(c => citySet.includes(c))
    const newCities = citySet.filter(c => !CITIES.includes(c))
    const availableCities = [...knownCities, ...newCities]

    let selectedCity = this.data.selectedCity
    let cityIndex = availableCities.indexOf(selectedCity)
    if (cityIndex === -1) {
      // Guess user city from location, default to 秦皇岛 if not found
      let guessCity = ''
      if (userLocation) {
        let minDist = Infinity
        for (const [city, coord] of Object.entries(CITY_COORDS)) {
          const dist = getDistanceKm(userLocation, coord)
          if (dist < minDist) {
            minDist = dist
            guessCity = city
          }
        }
        if (!availableCities.includes(guessCity)) {
          guessCity = ''
        }
      }
      const fallbackCity = availableCities.includes('秦皇岛') ? '秦皇岛' : (availableCities[0] || CITIES[0])
      selectedCity = guessCity || fallbackCity
      cityIndex = availableCities.indexOf(selectedCity)
    }

    const serviceOptions = this.buildServiceOptions(homes)
    const homesWithDistance = this.attachDistances(homes, userLocation)
    if (userLocation) {
      homesWithDistance.sort((a, b) => a._distance - b._distance)
    }

    this.setData({
      allHomes: homesWithDistance,
      cities: availableCities,
      selectedCity,
      cityIndex,
      serviceOptions,
      loading: false
    })

    this.filterVisibleHomes()
  },

  filterVisibleHomes() {
    this.filterHomes()
  },

  buildServiceOptions(source) {
    const services = source.reduce((result, home) => {
      if (home.services && Array.isArray(home.services)) {
        home.services.forEach((service) => result.add(service))
      }
      return result
    }, new Set())

    return ['全部', ...Array.from(services)]
  },

  buildMarkers(source) {
    return source.map((home, index) => ({
      id: index + 1,
      latitude: home.latitude,
      longitude: home.longitude,
      iconPath: '/assets/marker-home.png',
      title: home.name,
      width: 32,
      height: 32,
      callout: {
        content: home.name,
        display: 'BYCLICK',
        padding: 8,
        borderRadius: 6,
        bgColor: '#ffffff',
        color: '#17201d',
        fontSize: 13
      }
    }))
  },

  attachDistances(source, location = this.data.userLocation) {
    return source.map((home) => {
      if (!location) {
        return { ...home, distanceText: '', _distance: Infinity }
      }
      const km = getDistanceKm(location, home)
      return { ...home, distanceText: formatDistance(km), _distance: km }
    })
  },

  filterHomes(nextData = {}) {
    const keyword = 'keyword' in nextData ? nextData.keyword : this.data.keyword
    const selectedService = 'selectedService' in nextData ? nextData.selectedService : this.data.selectedService
    const selectedCity = this.data.selectedCity

    const normalizedKeyword = keyword.trim().toLowerCase()
    const visibleHomes = this.data.allHomes.filter((home) => {
      const matchesCity = !selectedCity || home.city === selectedCity
      const matchesService = selectedService === '全部' || (home.services && home.services.includes(selectedService))
      const searchableText = `${home.name || ''} ${home.city || ''} ${home.address || ''} ${(home.services || []).join(' ')} ${home.description || ''}`.toLowerCase()
      const matchesKeyword = !normalizedKeyword || searchableText.includes(normalizedKeyword)
      return matchesCity && matchesService && matchesKeyword
    })

    this.setData({
      keyword,
      selectedService,
      visibleHomes,
      markers: this.buildMarkers(visibleHomes)
    })

  },

  handleKeywordInput(event) {
    this.filterHomes({ keyword: event.detail.value })
  },

  selectService(event) {
    this.filterHomes({ selectedService: event.currentTarget.dataset.service })
  },

  toggleTraffic() {
    this.setData({ trafficEnabled: !this.data.trafficEnabled })
  },

  selectCity(event) {
    const index = Number(event.detail.value)
    const city = this.data.cities[index]
    this.setData({
      selectedCity: city,
      cityIndex: index,
      keyword: '',
      selectedService: '全部'
    })
    this.filterVisibleHomes()
  },

  handleMarkerTap(event) {
    const markerId = Number(event.detail.markerId)
    const home = this.data.visibleHomes[markerId - 1]
    if (home) {
      wx.navigateTo({
        url: `/pages/detail/detail?id=${home.dbId}`
      })
    }
  },

  openDetail(event) {
    const dbId = event.currentTarget.dataset.dbid
    wx.navigateTo({
      url: `/pages/detail/detail?id=${dbId}`
    })
  },

  openAdmin() {
    wx.navigateTo({ url: '/pages/admin/list/index' })
  },

  openLocation(event) {
    const dbId = event.currentTarget.dataset.dbid
    const home = this.data.allHomes.find((item) => item.dbId == dbId)

    if (!home) {
      return
    }

    wx.openLocation({
      latitude: home.latitude,
      longitude: home.longitude,
      name: home.name,
      address: home.address,
      scale: 18
    })
  },

  moveToUserLocation() {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        const userLocation = {
          latitude: res.latitude,
          longitude: res.longitude
        }
        const allHomes = this.attachDistances(this.data.allHomes, userLocation)
        allHomes.sort((a, b) => a._distance - b._distance)

        this.setData({
          userLocation,
          allHomes,
          showUserLocation: true,
          center: offsetCenterForPanel(userLocation, 12),
          scale: 12
        })
        this.filterHomes()
      },
      fail: () => {
        wx.showToast({
          title: '定位失败',
          icon: 'none'
        })
      }
    })
  },

  onShareAppMessage() {
    return {
      title: 'HBU校友之家地图',
      path: '/pages/index/index'
    }
  }
})
