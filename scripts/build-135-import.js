const fs = require('fs')
const path = require('path')

const source = path.join(__dirname, '..', 'docs', '公众号文章-135编辑器.html')
const target = path.join(__dirname, '..', 'docs', '135编辑器导入.html')

const html = fs.readFileSync(source, 'utf8')
const start = html.indexOf('<section style="max-width:640px')
const end = html.lastIndexOf('</section>')

if (start < 0 || end < 0 || end <= start) {
  throw new Error('未找到可导入 135 编辑器的 section 内容')
}

const snippet = html.slice(start, end + '</section>'.length).trim()
fs.writeFileSync(target, snippet + '\n')
console.log(`已生成 ${target}`)
