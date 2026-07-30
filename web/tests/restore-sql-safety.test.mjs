// 回归测试：数据库恢复时的 SQL 安全验证
//
// 背景：PostgreSQL 恢复时缺少文件内容验证，攻击者可上传恶意 SQL 导致数据丢失。
// 修复：恢复前检查文件是否为空，并检测 DROP DATABASE/DROP SCHEMA 等危险语句。
//
// 运行：node --test web/tests/restore-sql-safety.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'

// 危险模式检测逻辑（必须与 route.ts 中的实现保持一致）
function detectDangerousSql(sql, type = 'postgres') {
  if (!sql || sql.trim().length === 0) {
    return { empty: true, dangers: [] }
  }

  const dangerousPatterns = type === 'postgres'
    ? [
        { pattern: /\bDROP\s+DATABASE\b/gi, name: 'DROP DATABASE' },
        { pattern: /\bDROP\s+SCHEMA\b/gi, name: 'DROP SCHEMA' },
      ]
    : [
        { pattern: /\bDROP\s+DATABASE\b/gi, name: 'DROP DATABASE' },
      ]

  const detectedDangers = []
  for (const { pattern, name } of dangerousPatterns) {
    const matches = sql.match(pattern)
    if (matches && matches.length > 0) {
      detectedDangers.push(`${name} (${matches.length} 处)`)
    }
  }

  return { empty: false, dangers: detectedDangers }
}

test('空 SQL 文件应被拒绝', () => {
  const result = detectDangerousSql('')
  assert.equal(result.empty, true)
})

test('仅含空格的 SQL 文件应被拒绝', () => {
  const result = detectDangerousSql('   \n  \n  ')
  assert.equal(result.empty, true)
})

test('正常 SQL 文件应通过检查', () => {
  const sql = `
    CREATE TABLE User (id INT PRIMARY KEY);
    INSERT INTO User VALUES (1);
  `
  const result = detectDangerousSql(sql)
  assert.equal(result.empty, false)
  assert.equal(result.dangers.length, 0)
})

test('PostgreSQL: DROP DATABASE 应被检测', () => {
  const sql = 'DROP DATABASE production;'
  const result = detectDangerousSql(sql, 'postgres')
  assert.equal(result.dangers.length, 1)
  assert.ok(result.dangers[0].includes('DROP DATABASE'))
})

test('PostgreSQL: DROP SCHEMA 应被检测', () => {
  const sql = 'DROP SCHEMA public CASCADE;'
  const result = detectDangerousSql(sql, 'postgres')
  assert.equal(result.dangers.length, 1)
  assert.ok(result.dangers[0].includes('DROP SCHEMA'))
})

test('MySQL: DROP DATABASE 应被检测', () => {
  const sql = 'DROP DATABASE test_db;'
  const result = detectDangerousSql(sql, 'mysql')
  assert.equal(result.dangers.length, 1)
  assert.ok(result.dangers[0].includes('DROP DATABASE'))
})

test('MySQL: DROP SCHEMA 不应被检测（MySQL 不支持）', () => {
  const sql = 'DROP SCHEMA public;'
  const result = detectDangerousSql(sql, 'mysql')
  assert.equal(result.dangers.length, 0)
})

test('多条危险语句应全部检测', () => {
  const sql = `
    DROP DATABASE test1;
    CREATE TABLE t (id INT);
    DROP DATABASE test2;
    DROP SCHEMA public;
  `
  const result = detectDangerousSql(sql, 'postgres')
  assert.equal(result.dangers.length, 2)
  assert.ok(result.dangers[0].includes('2 处'))
})

test('大小写混合的 DROP DATABASE 应被检测', () => {
  const sql = 'DrOp DaTaBaSe production;'
  const result = detectDangerousSql(sql)
  assert.equal(result.dangers.length, 1)
})

test('DROP TABLE 不应触发警告（属于正常操作）', () => {
  const sql = 'DROP TABLE IF EXISTS temp_table;'
  const result = detectDangerousSql(sql)
  assert.equal(result.dangers.length, 0)
})

test('合法备份文件应通过检查', () => {
  const sql = `
    -- MySQL dump 10.13  Distrib 8.0.36
    --
    -- Host: localhost    Database: zscx
    -- ------------------------------------------------------
    -- Server version	8.0.36
    
    /*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
    
    CREATE TABLE User (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(191) NOT NULL
    );
    
    INSERT INTO User VALUES (1, 'admin');
  `
  const result = detectDangerousSql(sql)
  assert.equal(result.empty, false)
  assert.equal(result.dangers.length, 0)
})