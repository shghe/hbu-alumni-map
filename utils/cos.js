/**
 * COS 上传封装
 * 替换 wx.cloud.uploadFile()
 *
 * 依赖: cos-wx-sdk-v5 (需通过 npm 安装)
 *   npm install cos-wx-sdk-v5
 */

const { api } = require('./api')

// 延迟加载，避免未构建 npm 时启动报错
function getCOS() {
  try {
    return require('cos-wx-sdk-v5')
  } catch (e) {
    throw new Error('COS SDK 未安装，请在微信开发者工具中执行"工具→构建 npm"')
  }
}

/**
 * 获取 COS 上传临时凭证
 */
function fetchSTS(count = 1, isPublic = false) {
  const path = isPublic ? '/review-sts' : '/upload/sts'
  return api.get(path, { count })
}

/**
 * 上传单个文件到 COS
 * @param {string} filePath - 本地文件临时路径
 * @param {string} key - COS 对象键 (如 homes/123_abc.jpg)
 * @param {object} stsData - STS 临时凭证
 * @returns {Promise<string>} COS 文件 URL
 */
function uploadFile(filePath, key, stsData) {
  return new Promise((resolve, reject) => {
    const COS = getCOS()
    const cos = new COS({
      getAuthorization: (_options, callback) => {
        callback({
          TmpSecretId: stsData.credentials.tmpSecretId,
          TmpSecretKey: stsData.credentials.tmpSecretKey,
          SecurityToken: stsData.credentials.sessionToken,
          StartTime: stsData.startTime,
          ExpiredTime: stsData.expiredTime
        })
      }
    })

    cos.uploadFile({
      Bucket: stsData.bucket,
      Region: stsData.region,
      Key: key,
      FilePath: filePath
    }, (err, data) => {
      if (err) {
        console.error('COS upload error:', err)
        reject(err)
      } else {
        // 返回带 CDN 加速的 URL
        const url = `https://${data.Location}`
        resolve(url)
      }
    })
  })
}

/**
 * 批量上传文件
 * @param {Array<{filePath: string, key: string}>} files
 * @returns {Promise<string[]>} 文件 URL 数组
 */
async function uploadFiles(files) {
  if (files.length === 0) return []

  const stsData = await fetchSTS(files.length)
  const urls = []

  for (const { filePath, key } of files) {
    const url = await uploadFile(filePath, key, stsData)
    urls.push(url)
  }

  return urls
}

/**
 * 判断是否为本地临时文件（需要上传）
 */
function isTempFile(path) {
  if (!path) return false
  return path.startsWith('http://tmp') || path.startsWith('wxfile://')
}

module.exports = {
  fetchSTS,
  uploadFile,
  uploadFiles,
  isTempFile
}
