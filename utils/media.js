// 暂时不用，保留备用
const IMG_CACHE = {}
function getKeyFromUrl(url) { if (!url) return ''; try { return new URL(url).pathname.slice(1) } catch { return url } }
module.exports = { getKeyFromUrl, preloadImages: (urls) => Promise.resolve(urls || []), fetchImage: (url) => Promise.resolve(url), fetchVideo: (url) => Promise.resolve(url) }
