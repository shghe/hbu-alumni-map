const { api } = require('./api')

const UPLOAD_BASE64_CHARS = 2 * 1024 * 1024 // 1.5MB raw bytes; COS multipart non-final part stays above 1MB.

function readFileBase64(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success: res => resolve(res.data || ''),
      fail: reject
    })
  })
}

function normalizeEtag(etag) {
  if (!etag) return ''
  const value = String(etag)
  return value.startsWith('"') ? value : `"${value}"`
}

async function uploadFile(filePath, key) {
  const data = await readFileBase64(filePath)
  if (!data) throw new Error('文件读取失败')

  const init = await api.post('/media/upload/init', { key })
  if (!init || init.code !== 0 || !init.uploadId) {
    throw new Error((init && init.message) || '上传初始化失败')
  }

  const parts = []
  let partNumber = 1

  try {
    for (let offset = 0; offset < data.length; offset += UPLOAD_BASE64_CHARS) {
      const chunk = data.slice(offset, offset + UPLOAD_BASE64_CHARS)
      const res = await api.post('/media/upload/part', {
        key,
        uploadId: init.uploadId,
        partNumber,
        data: chunk
      })
      if (!res || res.code !== 0 || !res.etag) {
        throw new Error((res && res.message) || '上传分片失败')
      }
      parts.push({ partNumber, etag: normalizeEtag(res.etag) })
      partNumber += 1
    }

    const done = await api.post('/media/upload/complete', {
      key,
      uploadId: init.uploadId,
      parts
    })
    if (!done || done.code !== 0 || !done.url) {
      throw new Error((done && done.message) || '上传完成失败')
    }
    return done.url
  } catch (err) {
    api.post('/media/upload/abort', { key, uploadId: init.uploadId }).catch(() => {})
    throw err
  }
}

async function uploadFiles(files) {
  const urls = []
  for (const { filePath, key } of files) {
    urls.push(await uploadFile(filePath, key))
  }
  return urls
}

function isTempFile(path) {
  if (!path) return false
  return path.startsWith('http://tmp') || path.startsWith('wxfile://')
}

module.exports = {
  uploadFile,
  uploadFiles,
  isTempFile
}
