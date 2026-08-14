function isString(val, maxLen) {
  return typeof val === 'string' && val.length > 0 && val.length <= maxLen
}

function isNumber(val) {
  return typeof val === 'number' && !isNaN(val)
}

function isArray(val, maxItems) {
  return Array.isArray(val) && val.length <= maxItems
}

function validateHomeData(data, requireId) {
  const errors = []
  if (!isString(data.name, 100)) errors.push('name 必填且不超过100字')
  if (!isString(data.city, 50)) errors.push('city 必填且不超过50字')
  if (!isNumber(data.latitude) || data.latitude < -90 || data.latitude > 90) errors.push('latitude 无效')
  if (!isNumber(data.longitude) || data.longitude < -180 || data.longitude > 180) errors.push('longitude 无效')
  if (data.address && !isString(data.address, 200)) errors.push('address 不超过200字')
  if (data.phone && !isString(data.phone, 30)) errors.push('phone 不超过30字')
  if (data.wechat && !isString(data.wechat, 50)) errors.push('wechat 不超过50字')
  if (data.hours && !isString(data.hours, 100)) errors.push('hours 不超过100字')
  if (data.contactName && !isString(data.contactName, 30)) errors.push('contactName 不超过30字')
  if (data.description && !isString(data.description, 2000)) errors.push('description 不超过2000字')
  if (data.services && (!isArray(data.services, 20) || data.services.some(s => typeof s !== 'string' || s.length > 20))) {
    errors.push('services 最多20项，每项不超过20字')
  }
  if (data.photos && (!isArray(data.photos, 10) || data.photos.some(p => typeof p !== 'string' || p.length > 500))) {
    errors.push('photos 最多10张')
  }
  if (data.video && !isString(data.video, 500)) errors.push('video 无效')
  if (data.videoPoster && !isString(data.videoPoster, 500)) errors.push('videoPoster 无效')
  if (requireId && (!data.id || !Number.isInteger(data.id))) errors.push('id 无效')
  return errors
}

function validateReviewData(data) {
  const errors = []
  if (!data.homeId || (!Number.isInteger(data.homeId) && !isString(data.homeId, 50))) errors.push('homeId 无效')
  if (!isString(data.nickname, 30)) errors.push('昵称必填且不超过30字')
  if (!Number.isInteger(data.rating) || data.rating < 1 || data.rating > 5) errors.push('评分必须为1-5的整数')
  if (!isString(data.content, 1000)) errors.push('评价内容必填且不超过1000字')
  if (data.photos && (!isArray(data.photos, 9) || data.photos.some(p => typeof p !== 'string' || p.length > 500))) {
    errors.push('照片最多9张')
  }
  return errors
}

module.exports = { validateHomeData, validateReviewData, isString }
