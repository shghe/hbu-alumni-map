const COS = require('cos-nodejs-sdk-v5')

const cos = new COS({
  SecretId: process.env.COS_SECRET_ID,
  SecretKey: process.env.COS_SECRET_KEY
})

const BUCKET = process.env.COS_BUCKET || 'hbu-alumni-map'
const REGION = process.env.COS_REGION || 'ap-beijing'

/**
 * 生成 COS 临时上传凭证（STS）
 * @param {number} count 待上传文件数（影响临时密钥有效期）
 * @returns {object} { credentials, bucket, region, expiredTime }
 */
function getSTSCredentials(count = 1) {
  const durationSeconds = Math.min(60 * count + 60, 1800) // 最多 30 分钟

  return new Promise((resolve, reject) => {
    cos.getSTS({
      Bucket: BUCKET,
      Region: REGION,
      DurationSeconds: durationSeconds,
      AllowActions: [
        'name/cos:PutObject',
        'name/cos:PostObject',
        'name/cos:InitiateMultipartUpload',
        'name/cos:ListMultipartUploads',
        'name/cos:ListParts',
        'name/cos:UploadPart',
        'name/cos:CompleteMultipartUpload'
      ],
      AllowPrefix: '*' // 允许上传到任意路径
    }, (err, data) => {
      if (err) {
        console.error('STS error:', err)
        return reject(err)
      }
      resolve({
        credentials: data.credentials,
        bucket: BUCKET,
        region: REGION,
        startTime: data.startTime,
        expiredTime: data.expiredTime
      })
    })
  })
}

module.exports = { BUCKET, REGION, getSTSCredentials }
