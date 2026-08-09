/**
 * 审批模块 Schema 重构迁移脚本
 *
 * 作用：
 *  1. 为 ApprovalNode 中 nodeKey 为 NULL 的旧记录生成 uuid
 *  2. ALTER TABLE ApprovalNode DROP COLUMN（15 个 v1 废弃字段 + 13 个 v2 冗余字段）
 *  3. ALTER TABLE ApprovalWorkflow DROP COLUMN featureFlag
 *  4. 添加 @@unique([workflowId, nodeKey]) 索引
 *
 * 兼容 MySQL 5.7+
 *
 * 用法：
 *   node prisma/migrate-approval-nodes.js
 */

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// ---------- 工具函数 ----------

async function columnExists(table, column) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table, column
  )
  return rows.length > 0
}

async function indexExists(table, indexName) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?
     LIMIT 1`,
    table, indexName
  )
  return rows.length > 0
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// ---------- 主流程 ----------

async function main() {
  console.log('=== 审批模块 Schema 重构迁移 ===\n')

  // 检查 ApprovalNode 表是否存在
  const tables = await prisma.$queryRaw`SHOW TABLES`
  const tableNames = tables.map(t => Object.values(t)[0].toLowerCase())
  if (!tableNames.includes('approvalnode')) {
    console.log('ApprovalNode 表不存在，跳过迁移。')
    return
  }

  // ==================== 1. 填充缺失的 nodeKey ====================
  console.log('1. 检查并填充 ApprovalNode.nodeKey ...')
  const nullKeyNodes = await prisma.$queryRawUnsafe(
    `SELECT id, nodeType FROM \`ApprovalNode\` WHERE \`nodeKey\` IS NULL OR \`nodeKey\` = ''`
  )
  if (nullKeyNodes.length > 0) {
    console.log(`   发现 ${nullKeyNodes.length} 条 nodeKey 为空的记录，正在生成 uuid...`)
    for (const row of nullKeyNodes) {
      const newKey = uuid()
      await prisma.$queryRawUnsafe(
        `UPDATE \`ApprovalNode\` SET \`nodeKey\` = ? WHERE id = ?`,
        newKey, row.id
      )
    }
    console.log('   已填充所有 nodeKey。')
  } else {
    console.log('   所有 nodeKey 已有值，跳过。')
  }

  // ==================== 2. 删除 v1 废弃字段 ====================
  const v1Columns = [
    'nodeOrder', 'roleId', 'userId', 'fieldName',
    'canView', 'canEdit', 'canApprove', 'canTransfer',
    'timeout', 'timeoutAction',
    'conditionField', 'conditionOp', 'conditionValue',
    'nextNodeTrue', 'nextNodeFalse'
  ]

  console.log('\n2. 删除 ApprovalNode v1 废弃字段...')
  for (const col of v1Columns) {
    if (await columnExists('ApprovalNode', col)) {
      await prisma.$queryRawUnsafe(
        `ALTER TABLE \`ApprovalNode\` DROP COLUMN \`${col}\``
      )
      console.log(`   DROP COLUMN ${col} ✓`)
    } else {
      console.log(`   ${col} 不存在，跳过`)
    }
  }

  // ==================== 3. 删除 v2 冗余字段（配置统一存于 jsonDefinition） ====================
  const v2Columns = [
    'approvalMode', 'approverKind', 'approverCandidates',
    'countersignQuorum', 'conditionExpression',
    'parallelWaitMode', 'onRejectAction', 'gotoNodeKey',
    'timeoutHours', 'timeoutNodeAction',
    'ccTargets', 'notifyTemplateId', 'nodeConfig'
  ]

  console.log('\n3. 删除 ApprovalNode v2 冗余字段...')
  for (const col of v2Columns) {
    if (await columnExists('ApprovalNode', col)) {
      await prisma.$queryRawUnsafe(
        `ALTER TABLE \`ApprovalNode\` DROP COLUMN \`${col}\``
      )
      console.log(`   DROP COLUMN ${col} ✓`)
    } else {
      console.log(`   ${col} 不存在，跳过`)
    }
  }

  // ==================== 4. 修改 nodeKey 为 NOT NULL ====================
  console.log('\n4. 修改 nodeKey 列为 NOT NULL...')
  try {
    await prisma.$queryRawUnsafe(
      `ALTER TABLE \`ApprovalNode\` MODIFY COLUMN \`nodeKey\` VARCHAR(191) NOT NULL`
    )
    console.log('   nodeKey → NOT NULL ✓')
  } catch (e) {
    console.log('   修改 nodeKey 为 NOT NULL 失败:', e.message)
  }

  // ==================== 5. 添加 @@unique([workflowId, nodeKey]) 索引 ====================
  console.log('\n5. 添加唯一索引 ApprovalNode_workflowId_nodeKey_key...')
  if (!(await indexExists('ApprovalNode', 'ApprovalNode_workflowId_nodeKey_key'))) {
    try {
      await prisma.$queryRawUnsafe(
        `ALTER TABLE \`ApprovalNode\` ADD UNIQUE KEY \`ApprovalNode_workflowId_nodeKey_key\` (\`workflowId\`, \`nodeKey\`)`
      )
      console.log('   唯一索引已创建 ✓')
    } catch (e) {
      console.log('   创建唯一索引失败（可能有重复 nodeKey）:', e.message)
    }
  } else {
    console.log('   唯一索引已存在，跳过')
  }

  // ==================== 6. 删除旧的 nodeOrder 索引（如果存在） ====================
  console.log('\n6. 清理旧索引 ApprovalNode_nodeOrder_idx...')
  if (await indexExists('ApprovalNode', 'ApprovalNode_nodeOrder_idx')) {
    try {
      await prisma.$queryRawUnsafe(
        `ALTER TABLE \`ApprovalNode\` DROP INDEX \`ApprovalNode_nodeOrder_idx\``
      )
      console.log('   旧索引已删除 ✓')
    } catch (e) {
      console.log('   删除旧索引失败:', e.message)
    }
  } else {
    console.log('   旧索引不存在，跳过')
  }

  // ==================== 7. 删除 ApprovalWorkflow.featureFlag ====================
  console.log('\n7. 删除 ApprovalWorkflow.featureFlag...')
  if (await columnExists('ApprovalWorkflow', 'featureFlag')) {
    await prisma.$queryRawUnsafe(
      `ALTER TABLE \`ApprovalWorkflow\` DROP COLUMN \`featureFlag\``
    )
    console.log('   DROP COLUMN featureFlag ✓')
  } else {
    console.log('   featureFlag 不存在，跳过')
  }

  // ==================== 8. 将 ApprovalNode.nodeType 改为 VARCHAR ====================
  // 因为新的 Schema 使用 String 而非 enum，MySQL 中需要改为 VARCHAR
  console.log('\n8. 修改 ApprovalNode.nodeType 为 VARCHAR(191)...')
  try {
    await prisma.$queryRawUnsafe(
      `ALTER TABLE \`ApprovalNode\` MODIFY COLUMN \`nodeType\` VARCHAR(191) NOT NULL`
    )
    console.log('   nodeType → VARCHAR(191) ✓')
  } catch (e) {
    console.log('   修改 nodeType 失败:', e.message)
  }

  console.log('\n=== 迁移完成！ ===')
  console.log('请执行 `npx prisma generate` 重新生成 Prisma Client。')
}

main()
  .catch(e => {
    console.error('迁移失败:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
