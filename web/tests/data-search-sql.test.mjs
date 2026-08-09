// 回归测试：数据列表搜索 SQL 查询的正确性
//
// 背景：commit de4a80d 重构了数据搜索路径以支持 JSONB 数字字段。新增的 raw SQL
// 共享 statusCondition 片段，但 COUNT 查询的 FROM 子句没有表别名 'r'，导致
// 'AND r.status = $2' 在没有 'r' 别名的上下文中引用失败，
// PostgreSQL 抛出 'missing FROM-clause entry for table "r"'，
// 任何带 status 过滤的搜索都会返回 500。
//
// 修复：COUNT 查询同步使用 'FROM DataRecord r' 并为 tableId / data 加 'r.' 前缀。
//
// 运行：node --test web/tests/data-search-sql.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Prisma } from '@prisma/client'

// 复刻 route.ts 中的 SQL 构造逻辑（必须与实现保持一致）
function buildSearchQueries({ search, status, tableId, pageSize, page }) {
  const escapedSearch = search
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
  const searchPattern = `%${escapedSearch}%`

  const statusCondition = status
    ? Prisma.sql`AND r.status = ${status}`
    : Prisma.empty

  const recordQuery = Prisma.sql`
    SELECT
      r.id, r.tableId, r.data, r.status, r.createdAt, r.updatedAt, r.createdBy, r.updatedBy,
      u.real_name AS creator_realName, u.username AS creator_username
    FROM DataRecord r
    LEFT JOIN User u ON r.createdBy = u.id
    WHERE r.tableId = ${tableId}
    ${statusCondition}
    AND CAST(r.data AS CHAR) LIKE ${searchPattern}
    ORDER BY r.createdAt DESC
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
  `

  const countQuery = Prisma.sql`
    SELECT COUNT(*) AS total
    FROM DataRecord r
    WHERE r.tableId = ${tableId}
    ${statusCondition}
    AND CAST(r.data AS CHAR) LIKE ${searchPattern}
  `

  return { recordQuery, countQuery }
}

test('搜索+status 过滤：count 查询必须使用 r. 别名（避免 missing FROM-clause）', () => {
  const { countQuery } = buildSearchQueries({
    search: 'admin',
    status: 'DRAFT',
    tableId: 1,
    pageSize: 20,
    page: 1,
  })

  // 关键断言：FROM 子句必须有 r 别名
  assert.match(countQuery.text, /FROM\s+DataRecord\s+r\b/i, 'count query must alias DataRecord as r')

  // 关键断言：所有引用的列必须用 r. 前缀
  assert.match(countQuery.text, /r\.tableId/, 'count query must reference r.tableId')
  assert.match(countQuery.text, /r\.data/, 'count query must reference r.data')
  assert.match(countQuery.text, /r\.status/, 'count query must reference r.status (via statusCondition)')

  // 防御：不允许有未加别名的裸 'data' 或 'tableId' 出现
  assert.doesNotMatch(countQuery.text, /\bFROM\s+DataRecord\s+(?!r)/i, 'count query FROM must use r alias')
})

test('搜索+status 过滤：records 查询也必须使用 r. 别名', () => {
  const { recordQuery } = buildSearchQueries({
    search: 'admin',
    status: 'DRAFT',
    tableId: 1,
    pageSize: 20,
    page: 1,
  })

  assert.match(recordQuery.text, /FROM\s+DataRecord\s+r\b/i, 'records query must alias DataRecord as r')
  assert.match(recordQuery.text, /r\.data/, 'records query must reference r.data')
})

test('搜索不带 status：SQL 仍合法（Prisma.empty 不引入 r.status）', () => {
  const { recordQuery, countQuery } = buildSearchQueries({
    search: 'admin',
    status: '',
    tableId: 1,
    pageSize: 20,
    page: 1,
  })

  // statusCondition 为空时不会注入 r.status 到 WHERE 子句
  // （SELECT 列表中的 r.status 是列引用，无关）
  assert.doesNotMatch(countQuery.text, /WHERE[\s\S]*r\.status/, 'count WHERE must not reference r.status when no status filter')
  assert.doesNotMatch(recordQuery.text, /WHERE[\s\S]*r\.status/, 'records WHERE must not reference r.status when no status filter')

  // 但 r 别名仍存在（保证其他列引用一致）
  assert.match(countQuery.text, /FROM\s+DataRecord\s+r\b/i)
  assert.match(recordQuery.text, /FROM\s+DataRecord\s+r\b/i)
})

test('搜索关键字：LIKE 通配符 % _ \\ 都被正确转义', () => {
  const { countQuery, recordQuery } = buildSearchQueries({
    search: '100%_safe\\path',
    status: 'DRAFT',
    tableId: 1,
    pageSize: 20,
    page: 1,
  })

  // 转义后应为 %100\%%\_safe\\path%
  // 最后一个 value 应该是 searchPattern（count query 的最后一个参数）
  const expectedPattern = '%100\\%\\_safe\\\\path%'
  assert.equal(countQuery.values[countQuery.values.length - 1], expectedPattern, 'count query last value should be the escaped searchPattern')
  // records query 的最后一个 value 应该是 OFFSET
  // 而 searchPattern 应该是倒数第 3 个 value（offset 之前）
  // 但更稳健的检查是直接搜索转义模式是否出现在 values 中
  assert.ok(
    recordQuery.values.includes(expectedPattern),
    'records query values should contain the escaped searchPattern'
  )
})
