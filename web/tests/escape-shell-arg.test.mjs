// 回归测试：escapeShellArg 在 Windows 路径下的反斜杠处理
//
// 背景：之前的实现将 `\` 与 `$`、`` ` ``、! 等一起作为待转义字符，导致 Windows 路径
//   D:\backups\test.sql → "D:\\backups\\test.sql"，cmd.exe 找不到该文件，恢复失败。
// 本测试使用 Node 22 内置的 node:test 框架，无需额外依赖。
//
// 运行：node --test web/tests/escape-shell-arg.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'

// 必须与 web/app/api/database/{backup,restore}/route.ts 中的实现保持一致。
// 如果生产代码变更，必须同步更新此处。
function escapeShellArg(arg) {
  if (/^[a-zA-Z0-9_\-\.\/\\]+$/.test(arg)) {
    return arg
  }
  return `"${arg.replace(/(["$`!])/g, '\\$1')}"`
}

test('安全字符（仅字母数字下划线）原样返回', () => {
  assert.equal(escapeShellArg('localhost'), 'localhost')
  assert.equal(escapeShellArg('3306'), '3306')
  assert.equal(escapeShellArg('zscx_db'), 'zscx_db')
  assert.equal(escapeShellArg('my-database'), 'my-database')
})

test('安全路径（正斜杠）原样返回', () => {
  assert.equal(escapeShellArg('/var/lib/backups/test.sql'), '/var/lib/backups/test.sql')
  assert.equal(escapeShellArg('./backups/test.sql'), './backups/test.sql')
})

test('关键：Windows 反斜杠路径不会被二次转义', () => {
  // 这是修复的核心断言：反斜杠在双引号内不需要转义
  // 之前错误：'D:\backups\test.sql' → '"D:\\backups\\test.sql"'
  // 正确：    'D:\backups\test.sql' → '"D:\backups\test.sql"'
  const windowsPath = 'D:\\backups\\test.sql'
  const result = escapeShellArg(windowsPath)
  assert.equal(result, '"D:\\backups\\test.sql"',
    `反斜杠不应被二次转义，实际结果：${result}`)
  // 关键：结果中不应出现连续两个反斜杠
  assert.ok(!result.includes('\\\\'),
    '结果不应包含双重反斜杠（原 bug 症状）')
})

test('Windows 路径含中文和驱动器冒号', () => {
  const path = 'D:\\开发征收项目\\zscx\\web\\backups\\test.sql'
  const result = escapeShellArg(path)
  // 反斜杠保留，不应被双重转义
  assert.equal(result, '"D:\\开发征收项目\\zscx\\web\\backups\\test.sql"')
  assert.ok(!result.includes('\\\\'))
})

test('Windows 路径含空格（典型 Program Files）', () => {
  const path = 'C:\\Program Files\\MySQL\\backup.sql'
  const result = escapeShellArg(path)
  // 必须用双引号包裹以保护空格
  assert.equal(result, '"C:\\Program Files\\MySQL\\backup.sql"')
  // 反斜杠不应被二次转义
  assert.ok(!result.includes('\\\\'))
})

test('反注入：$ ` " ! 仍被正确转义', () => {
  // 关键安全断言：每个注入向量必须被转义并用双引号包裹
  assert.equal(escapeShellArg('a"b'), '"a\\"b"')
  assert.equal(escapeShellArg('a$b'), '"a\\$b"')
  assert.equal(escapeShellArg('a`b'), '"a\\`b"')
  assert.equal(escapeShellArg('a!b'), '"a\\!b"')
  // 多个特殊字符叠加：每个都被独立转义
  assert.equal(escapeShellArg('a"$b'), '"a\\"\\$b"')
  // 经典命令注入载荷
  assert.equal(escapeShellArg('evil"; rm -rf /'), '"evil\\"; rm -rf /"')
})

test('反注入：转义后所有内部双引号前都有反斜杠', () => {
  // 内部所有 `"` 都应被转义为 `\"`，且每个内部 `"` 之前都有一个 `\`
  const inputs = ['a"b', 'a"b"c', 'evil"; rm -rf /', '"""']
  for (const input of inputs) {
    const result = escapeShellArg(input)
    // 去掉首尾的包裹引号
    const inner = result.slice(1, -1)
    // 统计内部裸 `"` 的数量：扫描每个位置 i，若 inner[i]==='"' 且 i==0 或 inner[i-1]!=='\'，则该 `"` 未被转义
    let unescapedCount = 0
    for (let i = 0; i < inner.length; i++) {
      if (inner[i] === '"' && (i === 0 || inner[i - 1] !== '\\')) {
        unescapedCount++
      }
    }
    assert.equal(unescapedCount, 0,
      `输入 ${JSON.stringify(input)} 的结果 ${JSON.stringify(result)} 中有 ${unescapedCount} 个未转义的内部双引号`)
  }
})

test('反斜杠数量守恒：转义不会改变 \\ 字符的总数', () => {
  // 在转义前后，输入中的反斜杠数量应保持一致。
  // 关键不变量：每多出一个 \ 都意味着原 bug 仍存在。
  const cases = [
    'D:\\backups\\test.sql',
    'C:\\Program Files\\app',
    'D:\\开发征收项目\\zscx\\web\\backups\\test.sql',
    '\\\\server\\share\\file.txt',
  ]
  for (const input of cases) {
    const result = escapeShellArg(input)
    // 取出包裹引号内的内容
    const inner = result.startsWith('"') && result.endsWith('"')
      ? result.slice(1, -1)
      : result
    const inputCount = (input.match(/\\/g) || []).length
    const outputCount = (inner.match(/\\/g) || []).length
    assert.equal(outputCount, inputCount,
      `输入 ${input} 有 ${inputCount} 个 \\，输出 ${result} 有 ${outputCount} 个 \\`)
  }
})
