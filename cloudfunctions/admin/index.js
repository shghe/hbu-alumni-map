const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const PASSWORD = 'hbu2024'

// ---------- Validation helpers ----------

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
  if (data.services && (!isArray(data.services, 20) || data.services.some((s) => typeof s !== 'string' || s.length > 20))) {
    errors.push('services 最多20项，每项不超过20字')
  }
  if (data.photos && (!isArray(data.photos, 20) || data.photos.some((p) => typeof p !== 'string' || p.length > 500))) {
    errors.push('photos 最多20张')
  }
  if (data.video && !isString(data.video, 500)) errors.push('video 无效')
  if (data.videoPoster && !isString(data.videoPoster, 500)) errors.push('videoPoster 无效')
  if (requireId && !isString(data._id, 50)) errors.push('_id 无效')
  return errors
}

async function isAdmin(openid) {
  try {
    const res = await db.collection('admins').where({ openid }).get()
    return res.data.length > 0
  } catch {
    return false
  }
}

async function getAdminName(openid) {
  try {
    const res = await db.collection('admins').where({ openid }).get()
    return res.data.length > 0 && res.data[0].name ? res.data[0].name : openid
  } catch {
    return openid
  }
}

async function logAction(openid, action, detail) {
  const adminName = await getAdminName(openid)
  try {
    await db.collection('admin_logs').add({
      data: {
        openid,
        adminName,
        action,
        detail: detail || {},
        createTime: db.serverDate()
      }
    })
  } catch (e) {
    console.error('写日志失败', e)
  }
}

exports.main = async (event) => {
  const { action, password, data } = event
  const { OPENID } = cloud.getWXContext()

  // Bypass password check for admin users
  if (action !== 'login' && action !== 'checkAdmin' && action !== 'addReview' && password !== PASSWORD) {
    const admin = await isAdmin(OPENID)
    if (!admin) return { code: 401, message: '密码错误' }
  }

  switch (action) {
    case 'checkAdmin': {
      const admin = await isAdmin(OPENID)
      return { code: 0, isAdmin: admin, openid: OPENID }
    }

    case 'login': {
      if (password !== PASSWORD) return { code: 401, message: '密码错误' }
      return { code: 0, openid: OPENID, message: 'ok' }
    }

    case 'addReview': {
      // Validate review fields
      if (!isString(data.homeId, 50)) return { code: 400, message: 'homeId 无效' }
      if (!isString(data.nickname, 30)) return { code: 400, message: '昵称必填且不超过30字' }
      if (!isNumber(data.rating) || !Number.isInteger(data.rating) || data.rating < 1 || data.rating > 5) {
        return { code: 400, message: '评分必须为1-5的整数' }
      }
      if (!isString(data.content, 1000)) return { code: 400, message: '评价内容必填且不超过1000字' }
      if (data.photos && (!isArray(data.photos, 9) || data.photos.some((p) => typeof p !== 'string' || p.length > 500))) {
        return { code: 400, message: '照片最多9张' }
      }

      // Verify homeId exists
      try {
        const home = await db.collection('alumni_homes').doc(data.homeId).get()
        if (!home.data) return { code: 400, message: '校友之家不存在' }
      } catch {
        return { code: 400, message: '校友之家不存在' }
      }

      const res = await db.collection('reviews').add({
        data: {
          homeId: data.homeId,
          nickname: data.nickname.trim(),
          rating: data.rating,
          content: data.content.trim(),
          photos: data.photos || [],
          createTime: db.serverDate()
        }
      })
      return { code: 0, id: res._id }
    }

    case 'add': {
      const errs = validateHomeData(data, false)
      if (errs.length) return { code: 400, message: errs.join('; ') }
      const res = await db.collection('alumni_homes').add({ data })
      logAction(OPENID, 'add', { homeId: res._id, name: data.name, city: data.city })
      return { code: 0, id: res._id }
    }

    case 'update': {
      const errs = validateHomeData(data, true)
      if (errs.length) return { code: 400, message: errs.join('; ') }
      const { _id, ...rest } = data
      await db.collection('alumni_homes').doc(_id).update({ data: rest })
      logAction(OPENID, 'update', { homeId: _id, name: data.name, city: data.city })
      return { code: 0 }
    }

    case 'delete': {
      const { _id } = data
      if (!isString(_id, 50)) return { code: 400, message: '_id 无效' }
      // Get name before deleting for audit log
      let homeName = ''
      try { const h = await db.collection('alumni_homes').doc(_id).get(); homeName = h.data ? h.data.name : '' } catch {}
      await db.collection('alumni_homes').doc(_id).remove()
      const { stats } = await db.collection('reviews').where({ homeId: _id }).remove()
      logAction(OPENID, 'delete', { homeId: _id, name: homeName, deletedReviews: stats.removed || 0 })
      return { code: 0, deletedReviews: stats.removed || 0 }
    }

    case 'getReviews': {
      const res = await db.collection('reviews').orderBy('createTime', 'desc').get()
      const ids = [...new Set(res.data.map((r) => r.homeId))]
      const homes = await Promise.allSettled(
        ids.map((id) => db.collection('alumni_homes').doc(id).get())
      )
      const nameMap = {}
      homes.forEach((h, i) => {
        if (h.status === 'fulfilled' && h.value.data) nameMap[ids[i]] = h.value.data.name
      })
      return {
        code: 0,
        data: res.data.map((r) => ({ ...r, homeName: nameMap[r.homeId] || '已删除' }))
      }
    }

    case 'deleteReview': {
      const { _id } = data
      if (!isString(_id, 50)) return { code: 400, message: '_id 无效' }
      let reviewInfo = {}
      try { const r = await db.collection('reviews').doc(_id).get(); if (r.data) { reviewInfo = { nickname: r.data.nickname, homeId: r.data.homeId } } } catch {}
      await db.collection('reviews').doc(_id).remove()
      logAction(OPENID, 'deleteReview', { reviewId: _id, ...reviewInfo })
      return { code: 0 }
    }

    case 'getLogs': {
      const res = await db.collection('admin_logs').orderBy('createTime', 'desc').limit(100).get()
      return { code: 0, data: res.data }
    }

    default:
      return { code: 400, message: '未知操作' }
  }
}
