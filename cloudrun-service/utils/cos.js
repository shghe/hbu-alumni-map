const crypto = require('crypto')
const https = require('https')

const SECRET_ID = process.env.COS_SECRET_ID
const SECRET_KEY = process.env.COS_SECRET_KEY
const BUCKET = process.env.COS_BUCKET || 'hbu-alumni-map-1430752917'
const REGION = process.env.COS_REGION || 'ap-beijing'

/**
 * 通过腾讯云 STS API 直接获取临时上传凭证
 */
function getSTSCredentials(count = 1) {
  const durationSeconds = Math.min(60 * count + 60, 1800)
  const timestamp = Math.floor(Date.now() / 1000)
  const date = new Date(timestamp * 1000).toISOString().split('T')[0]
  const host = 'sts.tencentcloudapi.com'
  const service = 'sts'
  const action = 'GetFederationToken'
  const version = '2018-08-13'

  const policy = {
    version: '2.0',
    statement: [{
      effect: 'allow',
      action: [
        'name/cos:PutObject',
        'name/cos:PostObject',
        'name/cos:GetObject',
        'name/cos:InitiateMultipartUpload',
        'name/cos:UploadPart',
        'name/cos:ListParts',
        'name/cos:CompleteMultipartUpload',
        'name/cos:AbortMultipartUpload',
        'name/cos:ListMultipartUploads'
      ],
      resource: ['*']
    }]
  }

  const body = JSON.stringify({
    Name: 'alumni-upload',
    Policy: JSON.stringify(policy),
    DurationSeconds: durationSeconds
  })

  const hashedPayload = crypto.createHash('sha256').update(body).digest('hex')
  const canonicalRequest = `POST\n/\n\ncontent-type:application/json\nhost:${host}\n\ncontent-type;host\n${hashedPayload}`
  const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex')
  const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${date}/${service}/tc3_request\n${hashedCanonicalRequest}`
  const secretDate = crypto.createHmac('sha256', `TC3${SECRET_KEY}`).update(date).digest()
  const secretService = crypto.createHmac('sha256', secretDate).update(service).digest()
  const secretSigning = crypto.createHmac('sha256', secretService).update('tc3_request').digest()
  const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex')
  const authorization = `TC3-HMAC-SHA256 Credential=${SECRET_ID}/${date}/${service}/tc3_request, SignedHeaders=content-type;host, Signature=${signature}`

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: host,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authorization,
        'X-TC-Action': action,
        'X-TC-Version': version,
        'X-TC-Timestamp': timestamp.toString(),
        'X-TC-Region': REGION
      },
      rejectUnauthorized: false
    }, (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try {
          const result = JSON.parse(data)
          if (result.Response.Error) {
            reject(new Error(result.Response.Error.Code + ': ' + result.Response.Error.Message))
          } else if (result.Response.Credentials) {
            resolve({
              credentials: {
                tmpSecretId: result.Response.Credentials.TmpSecretId,
                tmpSecretKey: result.Response.Credentials.TmpSecretKey,
                sessionToken: result.Response.Credentials.Token
              },
              bucket: BUCKET,
              region: REGION,
              expiredTime: result.Response.ExpiredTime
            })
          } else {
            reject(new Error('STS 返回格式异常'))
          }
        } catch (e) {
          reject(e)
        }
      })
    })
    req.on('error', (e) => reject(new Error('网络错误: ' + e.message)))
    req.write(body)
    req.end()
  })
}

const COS = require('cos-nodejs-sdk-v5')
const cos = new COS({ SecretId: SECRET_ID, SecretKey: SECRET_KEY })

/**
 * 生成 COS 对象的预签名 URL（私有读）
 * @param {string} key - 对象键 (如 homes/xxx.jpg)
 * @param {number} expires - 有效期秒数，默认 3600 (1小时)
 * @returns {string} 带签名的完整 URL
 */
function getSignedUrl(key, expires = 3600) {
  return new Promise((resolve, reject) => {
    cos.getObjectUrl({
      Bucket: BUCKET,
      Region: REGION,
      Key: key,
      Expires: expires,
      Sign: true
    }, (err, data) => {
      if (err) reject(err)
      else resolve(data.Url)
    })
  })
}

/**
 * 将 COS URL 列表转为预签名 URL
 * @param {string[]} urls - COS 完整 URL 列表
 * @param {number} expires - 有效期秒数
 * @returns {Promise<string[]>} 预签名 URL 列表
 */
async function signUrls(urls, expires = 3600) {
  if (!urls || urls.length === 0) return []
  return Promise.all(urls.map(url => {
    // 只处理自己的 COS URL，外部 URL 直接返回
    if (!url || !url.includes(BUCKET)) return Promise.resolve(url)
    const key = url.replace(/^https?:\/\/[^/]+\//, '')
    return getSignedUrl(key, expires)
  }))
}

module.exports = { BUCKET, REGION, getSTSCredentials, getSignedUrl, signUrls }
