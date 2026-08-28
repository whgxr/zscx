// Docker 环境数据库迁移脚本
// 作用：容器启动时自动检查并执行数据库结构迁移和数据迁移
// 兼容 MySQL 5.7+

const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function main() {
  console.log('🔧 开始检查数据库状态...')

  // 检查是否需要迁移
  const tables = await prisma.$queryRaw`SHOW TABLES`
  const tableNames = tables.map(t => Object.values(t)[0].toLowerCase())
  console.log(`现有表: ${tableNames.length} 个`)

  const hasUserTable = tableNames.includes('user')
  const hasRoleTable = tableNames.includes('role')

  // ==================== 1. 创建 Role 表 ====================
  if (!hasRoleTable) {
    console.log('1. 创建 Role 表...')
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`Role\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`name\` VARCHAR(191) NOT NULL UNIQUE,
        \`label\` VARCHAR(191) NOT NULL,
        \`description\` TEXT NULL,
        \`canManageTables\` TINYINT(1) NOT NULL DEFAULT 0,
        \`canManageUsers\` TINYINT(1) NOT NULL DEFAULT 0,
        \`canManagePermissions\` TINYINT(1) NOT NULL DEFAULT 0,
        \`canManageTemplates\` TINYINT(1) NOT NULL DEFAULT 0,
        \`canViewLogs\` TINYINT(1) NOT NULL DEFAULT 0,
        \`canManageSettings\` TINYINT(1) NOT NULL DEFAULT 0,
        \`isSystem\` TINYINT(1) NOT NULL DEFAULT 0,
        \`sortOrder\` INT NOT NULL DEFAULT 0,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX \`Role_sortOrder_idx\` (\`sortOrder\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
  }

  // 插入默认角色
  const roles = [
    ['ADMIN', '超级管理员', '系统超级管理员，拥有所有权限', 1, 1, 1, 1, 1, 1, 1, 1],
    ['MANAGER', '管理员', '系统管理员，可管理数据和用户', 1, 1, 0, 1, 1, 0, 1, 2],
    ['USER', '录入员', '数据录入员，可录入和编辑数据', 0, 0, 0, 0, 0, 0, 1, 3],
    ['VIEWER', '查看员', '数据查看员，仅可查看数据', 0, 0, 0, 0, 0, 0, 1, 4],
  ]
  for (const r of roles) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO \`Role\` (\`name\`, \`label\`, \`description\`, \`canManageTables\`, \`canManageUsers\`, \`canManagePermissions\`, \`canManageTemplates\`, \`canViewLogs\`, \`canManageSettings\`, \`isSystem\`, \`sortOrder\`, \`updatedAt\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE \`label\`=VALUES(\`label\`), \`updatedAt\`=NOW()`,
      r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10]
    )
  }
  console.log('   ✅ Role 表就绪')

  // ==================== 2. 处理 User 表 ====================
  if (hasUserTable) {
    console.log('2. 检查 User 表迁移状态...')

    // 检查列
    const cols = await prisma.$queryRaw`DESCRIBE \`User\``
    const colNames = cols.map(c => c.Field)

    // 检查是否有 roleId 列
    if (!colNames.includes('roleId')) {
      console.log('   添加 roleId 列...')
      await prisma.$executeRawUnsafe('ALTER TABLE `User` ADD COLUMN `roleId` INT NULL')
    }

    // 检查是否有旧的 role 列（枚举类型）
    if (colNames.includes('role')) {
      console.log('   迁移 role 数据到 roleId...')
      // 根据旧 role 列更新 roleId
      await prisma.$executeRawUnsafe(`
        UPDATE \`User\` u
        SET u.\`roleId\` = (SELECT r.\`id\` FROM \`Role\` r WHERE r.\`name\` = u.\`role\`)
        WHERE u.\`roleId\` IS NULL
      `)
      // 删除旧 role 列
      try {
        await prisma.$executeRawUnsafe('ALTER TABLE `User` DROP COLUMN `role`')
        console.log('   已删除旧 role 列')
      } catch (e) {
        // 忽略错误
      }
    }

    // 设置没有 roleId 的用户为 USER 角色
    await prisma.$executeRawUnsafe(`
      UPDATE \`User\` u
      SET u.\`roleId\` = (SELECT r.\`id\` FROM \`Role\` r WHERE r.\`name\` = 'USER')
      WHERE u.\`roleId\` IS NULL
    `)

    // 设置 NOT NULL
    await prisma.$executeRawUnsafe('ALTER TABLE `User` MODIFY COLUMN `roleId` INT NOT NULL')
    console.log('   ✅ User 表迁移完成')
  }

  // ==================== 3. 创建其他缺失的表 ====================
  const tableChecks = [
    ['User', createUser],
    ['TableCategory', createTableCategory],
    ['DataTable', createDataTable],
    ['TableField', createTableField],
    ['TablePermission', createTablePermission],
    ['DataRecord', createDataRecord],
    ['RecordAttachment', createRecordAttachment],
    ['UploadedFile', createUploadedFile],
    ['OperationLog', createOperationLog],
    ['ErrorLog', createErrorLog],
    ['ExportTemplate', createExportTemplate],
    ['SystemSetting', createSystemSetting],
    ['UserDashboardConfig', createUserDashboardConfig],
    ['UserSession', createUserSession],
    ['_SharedTemplates', createSharedTemplates],
  ]

  for (const [name, createFn] of tableChecks) {
    if (!tableNames.includes(name.toLowerCase())) {
      console.log(`3. 创建 ${name} 表...`)
      await createFn(prisma)
    }
  }

  // ==================== 4. 检查并添加缺失的列 ====================
  console.log('4. 检查字段...')
  
  // TablePermission 添加新字段
  if (tableNames.includes('tablepermission')) {
    const permCols = await prisma.$queryRaw`DESCRIBE \`TablePermission\``
    const permColNames = permCols.map(c => c.Field)
    if (!permColNames.includes('canPrint')) {
      console.log('   给 TablePermission 添加 canPrint 字段')
      await prisma.$executeRawUnsafe('ALTER TABLE `TablePermission` ADD COLUMN `canPrint` TINYINT(1) NOT NULL DEFAULT 0')
    }
    if (!permColNames.includes('canExportExcel')) {
      console.log('   给 TablePermission 添加 canExportExcel 字段')
      await prisma.$executeRawUnsafe('ALTER TABLE `TablePermission` ADD COLUMN `canExportExcel` TINYINT(1) NOT NULL DEFAULT 0')
      if (permColNames.includes('canExport')) {
        await prisma.$executeRawUnsafe('UPDATE `TablePermission` SET `canExportExcel` = `canExport`')
      }
    }
    if (!permColNames.includes('canExportPdf')) {
      console.log('   给 TablePermission 添加 canExportPdf 字段')
      await prisma.$executeRawUnsafe('ALTER TABLE `TablePermission` ADD COLUMN `canExportPdf` TINYINT(1) NOT NULL DEFAULT 0')
      if (permColNames.includes('canExport')) {
        await prisma.$executeRawUnsafe('UPDATE `TablePermission` SET `canExportPdf` = `canExport`')
      }
    }
    if (!permColNames.includes('canImport')) {
      console.log('   给 TablePermission 添加 canImport 字段')
      await prisma.$executeRawUnsafe('ALTER TABLE `TablePermission` ADD COLUMN `canImport` TINYINT(1) NOT NULL DEFAULT 0')
    }
  }

  // DataTable 添加 categoryId 和 formLayoutConfig 字段
  if (tableNames.includes('datatable')) {
    const dtCols = await prisma.$queryRaw`DESCRIBE \`DataTable\``
    const dtColNames = dtCols.map(c => c.Field)
    if (!dtColNames.includes('categoryId')) {
      console.log('   给 DataTable 添加 categoryId 字段')
      await prisma.$executeRawUnsafe('ALTER TABLE `DataTable` ADD COLUMN `categoryId` INT NULL')
      await prisma.$executeRawUnsafe('ALTER TABLE `DataTable` ADD INDEX `DataTable_categoryId_idx` (`categoryId`)')
    }
    if (!dtColNames.includes('formLayoutConfig')) {
      console.log('   给 DataTable 添加 formLayoutConfig 字段')
      await prisma.$executeRawUnsafe('ALTER TABLE `DataTable` ADD COLUMN `formLayoutConfig` JSON NULL')
    }
    if (!dtColNames.includes('isDetailTable')) {
      console.log('   给 DataTable 添加 isDetailTable 字段')
      await prisma.$executeRawUnsafe('ALTER TABLE `DataTable` ADD COLUMN `isDetailTable` TINYINT(1) NOT NULL DEFAULT 0')
    }
  }

  // TableField type 枚举添加 DETAIL_TABLE + LEVY_RELATION
  if (tableNames.includes('tablefield')) {
    const tfCols = await prisma.$queryRaw`DESCRIBE \`TableField\``
    const typeCol = tfCols.find(c => c.Field === 'type')
    if (typeCol && typeCol.Type && (!typeCol.Type.includes('DETAIL_TABLE') || !typeCol.Type.includes('LEVY_RELATION'))) {
      console.log('   给 TableField.type 添加 DETAIL_TABLE / LEVY_RELATION 枚举值')
      await prisma.$executeRawUnsafe("ALTER TABLE `TableField` MODIFY COLUMN `type` ENUM('TEXT','TEXTAREA','NUMBER','INTEGER','FLOAT','DATE','DATETIME','SELECT','RADIO','MULTISELECT','CHECKBOX','UPLOAD_IMAGE','UPLOAD_FILE','PHONE','EMAIL','IDCARD','ADDRESS','MONEY','SWITCH','RICHTEXT','RELATION','DETAIL_TABLE','LEVY_RELATION') NOT NULL")
    }
    // v1.2.2+ 征收：强制显示 + 可填写阶段
    const tfColNames = tfCols.map(c => c.Field)
    if (!tfColNames.includes('forceShowInSurveyList')) {
      console.log('   给 TableField 添加 forceShowInSurveyList 字段')
      await prisma.$executeRawUnsafe('ALTER TABLE `TableField` ADD COLUMN `forceShowInSurveyList` TINYINT(1) NOT NULL DEFAULT 0')
    }
    if (!tfColNames.includes('forceShowInLevyList')) {
      console.log('   给 TableField 添加 forceShowInLevyList 字段')
      await prisma.$executeRawUnsafe('ALTER TABLE `TableField` ADD COLUMN `forceShowInLevyList` TINYINT(1) NOT NULL DEFAULT 0')
    }
    if (!tfColNames.includes('editScope')) {
      console.log('   给 TableField 添加 editScope 字段')
      await prisma.$executeRawUnsafe(`ALTER TABLE \`TableField\` ADD COLUMN \`editScope\` ENUM('SURVEY_ONLY','LEVY_ONLY','SURVEY_OR_LEVY','ALWAYS') NOT NULL DEFAULT 'ALWAYS'`)
    }
  }

  // ExportTemplate 添加 category 字段（支持多分类逗号分隔）
  if (tableNames.includes('exporttemplate')) {
    const etCols = await prisma.$queryRaw`DESCRIBE \`ExportTemplate\``
    const etColNames = etCols.map(c => c.Field)
    if (!etColNames.includes('isShared')) {
      console.log('   给 ExportTemplate 添加 isShared 字段')
      await prisma.$executeRawUnsafe('ALTER TABLE `ExportTemplate` ADD COLUMN `isShared` TINYINT(1) NOT NULL DEFAULT 0')
    }
    const catCol = etCols.find(c => c.Field === 'category')
    if (!catCol) {
      console.log('   给 ExportTemplate 添加 category 字段')
      await prisma.$executeRawUnsafe("ALTER TABLE `ExportTemplate` ADD COLUMN `category` VARCHAR(191) NOT NULL DEFAULT 'EXPORT'")
      await prisma.$executeRawUnsafe("ALTER TABLE `ExportTemplate` ADD INDEX `ExportTemplate_category_idx` (`category`)")
    } else if (catCol.Type && catCol.Type.toLowerCase().startsWith('enum')) {
      console.log('   ExportTemplate.category: ENUM -> VARCHAR(191)')
      await prisma.$executeRawUnsafe("ALTER TABLE `ExportTemplate` MODIFY COLUMN `category` VARCHAR(191) NOT NULL DEFAULT 'EXPORT'")
    }
  }

  // SystemSetting 添加默认值
  if (tableNames.includes('systemsetting')) {
    await prisma.$executeRawUnsafe(`
      INSERT INTO \`SystemSetting\` (\`key\`, \`value\`, \`description\`, \`updatedAt\`)
      VALUES ('sessionTimeout', '30', '用户不操作自动退出时间（分钟）', NOW())
      ON DUPLICATE KEY UPDATE \`value\`=VALUES(\`value\`), \`updatedAt\`=NOW()
    `)
  }

  // ==================== 6. Role 表扩展 - 添加新权限字段 (迭代 1.2.2) ====================
  console.log('6. 扩展 Role 表权限字段...')
  if (tableNames.includes('role')) {
    const roleCols = await prisma.$queryRaw`DESCRIBE \`Role\``
    const roleColNames = roleCols.map(c => c.Field)
    if (!roleColNames.includes('canManageApproval')) {
      console.log('   给 Role 添加 canManageApproval 字段')
      await prisma.$executeRawUnsafe('ALTER TABLE `Role` ADD COLUMN `canManageApproval` TINYINT(1) NOT NULL DEFAULT 0')
      await prisma.$executeRawUnsafe('UPDATE `Role` SET `canManageApproval` = 1 WHERE `name` IN ("ADMIN", "MANAGER")')
    }
    if (!roleColNames.includes('canPublishNotification')) {
      console.log('   给 Role 添加 canPublishNotification 字段')
      await prisma.$executeRawUnsafe('ALTER TABLE `Role` ADD COLUMN `canPublishNotification` TINYINT(1) NOT NULL DEFAULT 0')
      await prisma.$executeRawUnsafe('UPDATE `Role` SET `canPublishNotification` = 1 WHERE `name` IN ("ADMIN", "MANAGER")')
    }
  }

  // ==================== 7. 创建审批流程相关表 (迭代 1.2.2) ====================
  console.log('7. 创建审批流程相关表...')
  if (!tableNames.includes('approvalworkflow')) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`ApprovalWorkflow\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`name\` VARCHAR(191) NOT NULL,
        \`tableId\` INT NOT NULL,
        \`description\` TEXT NULL,
        \`status\` ENUM('ACTIVE','INACTIVE','DRAFT') NOT NULL DEFAULT 'ACTIVE',
        \`version\` INT NOT NULL DEFAULT 1,
        \`canvasData\` LONGTEXT NULL,
        \`createdBy\` INT NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX \`ApprovalWorkflow_tableId_idx\` (\`tableId\`),
        INDEX \`ApprovalWorkflow_status_idx\` (\`status\`),
        INDEX \`ApprovalWorkflow_version_idx\` (\`version\`),
        CONSTRAINT \`ApprovalWorkflow_tableId_fkey\` FOREIGN KEY (\`tableId\`) REFERENCES \`DataTable\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    console.log('   ✅ ApprovalWorkflow 表创建完成')
  }

  if (!tableNames.includes('approvalnode')) {
    // v2 精简结构：仅 nodeKey/nodeType/nodeName（完整定义存 jsonDefinition）
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`ApprovalNode\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`workflowId\` INT NOT NULL,
        \`nodeKey\` VARCHAR(191) NOT NULL,
        \`nodeType\` VARCHAR(191) NOT NULL,
        \`nodeName\` VARCHAR(191) NOT NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        UNIQUE INDEX \`ApprovalNode_workflowId_nodeKey_key\` (\`workflowId\`, \`nodeKey\`),
        INDEX \`ApprovalNode_workflowId_idx\` (\`workflowId\`),
        CONSTRAINT \`ApprovalNode_workflowId_fkey\` FOREIGN KEY (\`workflowId\`) REFERENCES \`ApprovalWorkflow\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    console.log('   ✅ ApprovalNode 表创建完成')
  } else {
    // 旧版 ApprovalNode（30+ 字段）→ v2 精简结构迁移
    console.log('   检查 ApprovalNode 表结构（v2 精简迁移）...')
    const anCols = await prisma.$queryRaw`DESCRIBE \`ApprovalNode\``
    const anColNames = anCols.map(c => c.Field)
    if (anColNames.includes('nodeOrder')) {
      console.log('   迁移 ApprovalNode: 旧结构 -> v2 精简结构')
      if (!anColNames.includes('nodeKey')) {
        await prisma.$executeRawUnsafe('ALTER TABLE `ApprovalNode` ADD COLUMN `nodeKey` VARCHAR(191) NULL')
        await prisma.$executeRawUnsafe('UPDATE `ApprovalNode` SET `nodeKey` = CAST(`id` AS CHAR) WHERE `nodeKey` IS NULL')
      }
      // 删除旧索引
      const anIdx = await prisma.$queryRaw`SHOW INDEX FROM \`ApprovalNode\``
      const idxNames = [...new Set(anIdx.map(i => i.Key_name))]
      for (const name of idxNames) {
        if (name === 'PRIMARY' || name === 'ApprovalNode_workflowId_nodeKey_key') continue
        try { await prisma.$executeRawUnsafe(`ALTER TABLE \`ApprovalNode\` DROP INDEX \`${name}\``) } catch {}
      }
      // 删除指向旧字段的外键约束
      const fks = await prisma.$queryRaw`
        SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ApprovalNode' AND REFERENCED_TABLE_NAME IS NOT NULL`
      for (const f of fks) {
        const cname = f.CONSTRAINT_NAME || f.constraint_name
        if (cname === 'ApprovalNode_workflowId_fkey') continue
        try { await prisma.$executeRawUnsafe(`ALTER TABLE \`ApprovalNode\` DROP FOREIGN KEY \`${cname}\``) } catch {}
      }
      // 删除旧列
      const oldCols = ['nodeOrder','roleId','userId','fieldName','canView','canEdit','canApprove','canTransfer','timeout','timeoutAction','conditionField','conditionOp','conditionValue','nextNodeTrue','nextNodeFalse','approvalMode','approverKind','approverCandidates','ccTargets','expression','label','featureFlag','dueSeconds']
      for (const c of oldCols) {
        if (anColNames.includes(c)) {
          try { await prisma.$executeRawUnsafe(`ALTER TABLE \`ApprovalNode\` DROP COLUMN \`${c}\``) } catch {}
        }
      }
      // nodeType: ENUM -> VARCHAR(191)
      await prisma.$executeRawUnsafe('ALTER TABLE `ApprovalNode` MODIFY COLUMN `nodeType` VARCHAR(191) NOT NULL')
      await prisma.$executeRawUnsafe('ALTER TABLE `ApprovalNode` MODIFY COLUMN `nodeKey` VARCHAR(191) NOT NULL')
      // 唯一索引（先清理重复的 workflowId+nodeKey）
      try {
        await prisma.$executeRawUnsafe(`
          DELETE a FROM \`ApprovalNode\` a
          JOIN \`ApprovalNode\` b ON a.workflowId = b.workflowId AND a.nodeKey = b.nodeKey AND a.id > b.id`)
        await prisma.$executeRawUnsafe('ALTER TABLE `ApprovalNode` ADD UNIQUE INDEX `ApprovalNode_workflowId_nodeKey_key` (`workflowId`, `nodeKey`)')
      } catch {}
      console.log('   ✅ ApprovalNode v2 精简迁移完成')
    }
  }

  if (!tableNames.includes('approvalinstance')) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`ApprovalInstance\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`workflowId\` INT NOT NULL,
        \`tableId\` INT NOT NULL,
        \`recordId\` INT NOT NULL,
        \`currentNodeId\` INT NULL,
        \`status\` ENUM('PENDING','APPROVED','REJECTED','CANCELLED') NOT NULL DEFAULT 'PENDING',
        \`initiatorId\` INT NULL,
        \`startedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`completedAt\` DATETIME(3) NULL,
        \`cancelledAt\` DATETIME(3) NULL,
        \`cancelReason\` TEXT NULL,
        INDEX \`ApprovalInstance_workflowId_idx\` (\`workflowId\`),
        INDEX \`ApprovalInstance_tableId_idx\` (\`tableId\`),
        INDEX \`ApprovalInstance_recordId_idx\` (\`recordId\`),
        INDEX \`ApprovalInstance_status_idx\` (\`status\`),
        INDEX \`ApprovalInstance_initiatorId_idx\` (\`initiatorId\`),
        CONSTRAINT \`ApprovalInstance_workflowId_fkey\` FOREIGN KEY (\`workflowId\`) REFERENCES \`ApprovalWorkflow\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`ApprovalInstance_tableId_fkey\` FOREIGN KEY (\`tableId\`) REFERENCES \`DataTable\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`ApprovalInstance_recordId_fkey\` FOREIGN KEY (\`recordId\`) REFERENCES \`DataRecord\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`ApprovalInstance_initiatorId_fkey\` FOREIGN KEY (\`initiatorId\`) REFERENCES \`User\`(\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    console.log('   ✅ ApprovalInstance 表创建完成')
  }

  if (!tableNames.includes('approvalnodeinstance')) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`ApprovalNodeInstance\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`instanceId\` INT NOT NULL,
        \`nodeId\` INT NOT NULL,
        \`assigneeId\` INT NULL,
        \`status\` ENUM('PENDING','APPROVED','REJECTED','TRANSFERRED','CANCELLED') NOT NULL DEFAULT 'PENDING',
        \`action\` ENUM('APPROVE','REJECT','TRANSFER','CANCEL') NULL,
        \`comment\` TEXT NULL,
        \`transferredTo\` INT NULL,
        \`processedAt\` DATETIME(3) NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE INDEX \`ApprovalNodeInstance_instanceId_nodeId_assigneeId_key\` (\`instanceId\`, \`nodeId\`, \`assigneeId\`),
        INDEX \`ApprovalNodeInstance_instanceId_idx\` (\`instanceId\`),
        INDEX \`ApprovalNodeInstance_assigneeId_idx\` (\`assigneeId\`),
        INDEX \`ApprovalNodeInstance_status_idx\` (\`status\`),
        CONSTRAINT \`ApprovalNodeInstance_instanceId_fkey\` FOREIGN KEY (\`instanceId\`) REFERENCES \`ApprovalInstance\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`ApprovalNodeInstance_nodeId_fkey\` FOREIGN KEY (\`nodeId\`) REFERENCES \`ApprovalNode\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`ApprovalNodeInstance_assigneeId_fkey\` FOREIGN KEY (\`assigneeId\`) REFERENCES \`User\`(\`id\`) ON DELETE SET NULL,
        CONSTRAINT \`ApprovalNodeInstance_transferredTo_fkey\` FOREIGN KEY (\`transferredTo\`) REFERENCES \`User\`(\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    console.log('   ✅ ApprovalNodeInstance 表创建完成')
  }

  // ==================== 8. 创建第三方绑定表 (迭代 1.2.2) ====================
  console.log('8. 创建第三方绑定表...')
  if (!tableNames.includes('userthirdpartybinding')) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`UserThirdPartyBinding\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`userId\` INT NOT NULL,
        \`platform\` ENUM('FEISHU','WEWORK') NOT NULL,
        \`platformUserId\` VARCHAR(191) NOT NULL,
        \`platformUserName\` VARCHAR(191) NOT NULL,
        \`accessToken\` TEXT NULL,
        \`refreshToken\` TEXT NULL,
        \`expiresAt\` DATETIME(3) NULL,
        \`status\` ENUM('ACTIVE','EXPIRED','UNBOUND') NOT NULL DEFAULT 'ACTIVE',
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        UNIQUE INDEX \`UserThirdPartyBinding_userId_platform_key\` (\`userId\`, \`platform\`),
        INDEX \`UserThirdPartyBinding_userId_idx\` (\`userId\`),
        INDEX \`UserThirdPartyBinding_platform_idx\` (\`platform\`),
        INDEX \`UserThirdPartyBinding_platformUserId_idx\` (\`platformUserId\`),
        CONSTRAINT \`UserThirdPartyBinding_userId_fkey\` FOREIGN KEY (\`userId\`) REFERENCES \`User\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    console.log('   ✅ UserThirdPartyBinding 表创建完成')
  }

  // ==================== 9. 创建通知相关表 (迭代 1.2.2) ====================
  console.log('9. 创建通知相关表...')
  if (!tableNames.includes('notification')) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`Notification\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`type\` ENUM('SYSTEM','BUSINESS','APPROVAL','ALERT') NOT NULL,
        \`title\` VARCHAR(191) NOT NULL,
        \`content\` TEXT NOT NULL,
        \`targetType\` ENUM('ALL','ROLE','USER') NOT NULL,
        \`targetRoleId\` INT NULL,
        \`targetUserIds\` LONGTEXT NULL,
        \`priority\` ENUM('LOW','NORMAL','HIGH','URGENT') NOT NULL DEFAULT 'NORMAL',
        \`linkUrl\` VARCHAR(191) NULL,
        \`linkParams\` LONGTEXT NULL,
        \`createdBy\` INT NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`expiredAt\` DATETIME(3) NULL,
        INDEX \`Notification_type_idx\` (\`type\`),
        INDEX \`Notification_targetType_idx\` (\`targetType\`),
        INDEX \`Notification_createdAt_idx\` (\`createdAt\`),
        INDEX \`Notification_expiredAt_idx\` (\`expiredAt\`),
        CONSTRAINT \`Notification_createdBy_fkey\` FOREIGN KEY (\`createdBy\`) REFERENCES \`User\`(\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    console.log('   ✅ Notification 表创建完成')
  }

  if (!tableNames.includes('notificationread')) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`NotificationRead\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`notificationId\` INT NOT NULL,
        \`userId\` INT NOT NULL,
        \`readAt\` DATETIME(3) NULL,
        \`isDeleted\` TINYINT(1) NOT NULL DEFAULT 0,
        UNIQUE INDEX \`NotificationRead_notificationId_userId_key\` (\`notificationId\`, \`userId\`),
        INDEX \`NotificationRead_userId_idx\` (\`userId\`),
        INDEX \`NotificationRead_readAt_idx\` (\`readAt\`),
        CONSTRAINT \`NotificationRead_notificationId_fkey\` FOREIGN KEY (\`notificationId\`) REFERENCES \`Notification\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`NotificationRead_userId_fkey\` FOREIGN KEY (\`userId\`) REFERENCES \`User\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    console.log('   ✅ NotificationRead 表创建完成')
  }

  if (!tableNames.includes('notificationsendlog')) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`NotificationSendLog\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`notificationId\` INT NOT NULL,
        \`userId\` INT NOT NULL,
        \`channel\` ENUM('INTERNAL','FEISHU','WEWORK') NOT NULL,
        \`status\` ENUM('PENDING','SUCCESS','FAILED') NOT NULL DEFAULT 'PENDING',
        \`sentAt\` DATETIME(3) NULL,
        \`errorMessage\` TEXT NULL,
        INDEX \`NotificationSendLog_notificationId_idx\` (\`notificationId\`),
        INDEX \`NotificationSendLog_userId_idx\` (\`userId\`),
        INDEX \`NotificationSendLog_status_idx\` (\`status\`),
        CONSTRAINT \`NotificationSendLog_notificationId_fkey\` FOREIGN KEY (\`notificationId\`) REFERENCES \`Notification\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`NotificationSendLog_userId_fkey\` FOREIGN KEY (\`userId\`) REFERENCES \`User\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    console.log('   ✅ NotificationSendLog 表创建完成')
  }

  // ==================== 10. 创建默认管理员（如果没有用户） ====================
  // 在所有表创建完成后，再次检查 User 表是否存在且为空
  const finalTables = await prisma.$queryRaw`SHOW TABLES`
  const finalTableNames = finalTables.map(t => Object.values(t)[0].toLowerCase())
  
  if (finalTableNames.includes('user')) {
    const userCount = await prisma.$queryRaw`SELECT COUNT(*) as c FROM \`User\``
    if (userCount[0].c === 0) {
      console.log('10. 创建默认管理员...')
      const passwordHash = await bcrypt.hash('admin123', 10)
      await prisma.$executeRawUnsafe(`
        INSERT INTO \`User\` (\`username\`, \`passwordHash\`, \`realName\`, \`roleId\`, \`phone\`, \`updatedAt\`)
        VALUES ('admin', ?, '系统管理员', 
          (SELECT \`id\` FROM \`Role\` WHERE \`name\` = 'ADMIN'),
          '13800138000', NOW())
      `, passwordHash)
      console.log('   ✅ 默认管理员已创建: admin / admin123')
    } else {
      console.log('10. 已有用户，跳过创建默认管理员')
    }
  } else {
    console.log('10. ⚠️ User 表不存在，无法创建默认管理员')
  }

  // ==================== 38. ApprovalWorkflow.tableId 可空（表级解耦） ====================
  console.log('\n38. ApprovalWorkflow.tableId 改为可空（流程与表解耦）...')
  try {
    const [fks] = await prisma.$queryRawUnsafe(`
      SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ApprovalWorkflow'
        AND COLUMN_NAME = 'tableId' AND REFERENCED_TABLE_NAME IS NOT NULL
    `)
    for (const fk of fks || []) {
      await prisma.$executeRawUnsafe(`ALTER TABLE \`ApprovalWorkflow\` DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\``)
    }
    const [cols] = await prisma.$queryRawUnsafe(`SHOW COLUMNS FROM \`ApprovalWorkflow\` LIKE 'tableId'`)
    if (cols && cols.length && String(cols[0].Null) === 'NO') {
      await prisma.$executeRawUnsafe(`ALTER TABLE \`ApprovalWorkflow\` MODIFY COLUMN \`tableId\` INT NULL`)
    }
    await prisma.$executeRawUnsafe(`ALTER TABLE \`ApprovalWorkflow\` ADD CONSTRAINT \`ApprovalWorkflow_tableId_fkey\` FOREIGN KEY (\`tableId\`) REFERENCES \`DataTable\`(\`id\`) ON DELETE SET NULL`)
    console.log('   ✅ ApprovalWorkflow.tableId 可空完成')
  } catch (e) {
    console.log('   ⚠️  ApprovalWorkflow.tableId 迁移跳过:', e.message)
  }

  // ==================== 39. 自动生成 LEVY_RELATION 系统字段（征收↔调查，默认生成且不允许修改） ====================
  console.log('\n39. 自动生成 LEVY_RELATION 系统字段...')
  {
    const tables = await prisma.$queryRawUnsafe(`
      SELECT d.id, d.name AS tblName, d.label AS tblLabel, c.module
      FROM \`DataTable\` d
      LEFT JOIN \`TableCategory\` c ON c.id = d.categoryId
    `)
    const surveyTables = (tables || []).filter(t => t.module === 'SURVEY')
    const levyTables = (tables || []).filter(t => t.module === 'LEVY')
    if (levyTables.length && surveyTables.length) {
      for (const levy of levyTables) {
        const fields = await prisma.$queryRawUnsafe(
          `SELECT id, name, config, isSystem FROM \`TableField\` WHERE tableId=? AND type='LEVY_RELATION'`,
          levy.id
        )
        for (const survey of surveyTables) {
          const fieldName = `${survey.tblName}_ref`
          // 优先按字段名匹配（确定性命名），config 解析在 Prisma 下类型不稳定，仅作兜底
          const existing = (fields || []).find(f => {
            if (f.name === fieldName) return true
            try {
              const cfg = typeof f.config === 'string' ? JSON.parse(f.config || '{}') : (f.config || {})
              return Number(cfg?.levy?.targetTableId) === Number(survey.id)
            } catch { return false }
          })
          if (existing) {
            if (Number(existing.isSystem) === 1) continue
            await prisma.$executeRawUnsafe('UPDATE `TableField` SET isSystem=1 WHERE id=?', existing.id)
            console.log(`   ✅ ${levy.tblLabel}.${existing.name} 已升级为系统字段（不可修改/删除）`)
            continue
          }
          try {
            const maxSort = await prisma.$queryRawUnsafe('SELECT MAX(sortOrder) m FROM `TableField` WHERE tableId=?', levy.id)
            const sortOrder = (maxSort[0].m ?? 0) + 1
            const config = JSON.stringify({ levy: { targetTableId: Number(survey.id), cardinality: 'ONE_TO_ONE', syncMode: 'SNAPSHOT_APPROVAL' } })
            await prisma.$executeRawUnsafe(
              `INSERT INTO \`TableField\` (tableId, name, label, type, required, sortOrder, description, config, isSystem, showInList, showInForm, showInSearch, updatedAt)
               VALUES (?, ?, ?, 'LEVY_RELATION', 1, ?, ?, ?, 1, 1, 1, 1, NOW())`,
              levy.id, fieldName, `关联调查（${survey.tblLabel}）`, sortOrder, `LEVY_RELATION：1:1 自动关联调查表「${survey.tblLabel}」，写入时同步快照`, config
            )
            console.log(`   ➕ ${levy.tblLabel} 自动创建系统字段 ${fieldName} → ${survey.tblLabel}`)
          } catch (e) {
            console.log(`   ⚠️  ${levy.tblLabel}.${fieldName} 创建失败:`, e.message)
          }
        }
      }
    } else {
      console.log('   （无需处理：未同时存在 调查表 与 征收表）')
    }
  }

  // ==================== 40. ApprovalWorkflow.specialAction 专项动作审批 ====================
  console.log('\n40. ApprovalWorkflow 增加 specialAction 列（专项动作审批）...')
  try {
    const [acols] = await prisma.$queryRawUnsafe(`SHOW COLUMNS FROM \`ApprovalWorkflow\` LIKE 'specialAction'`)
    if (!acols || !acols.length) {
      await prisma.$executeRawUnsafe(`ALTER TABLE \`ApprovalWorkflow\` ADD COLUMN \`specialAction\` LONGTEXT NULL`)
      console.log('   ✅ ApprovalWorkflow.specialAction 添加完成')
    } else {
      console.log('   ⚠️  ApprovalWorkflow.specialAction 已存在，跳过')
    }
  } catch (e) {
    console.log('   ⚠️  ApprovalWorkflow.specialAction 迁移跳过:', e.message)
  }

  // ==================== 41. 移除 DataRecord.status 的 SYNC_PENDING（状态不参与调查↔征收同步） ====================
  console.log('\n41. 清理 DataRecord.status 枚举中的 SYNC_PENDING（状态不参与同步）...')
  try {
    const [scols] = await prisma.$queryRawUnsafe(`SHOW COLUMNS FROM \`DataRecord\` LIKE 'status'`)
    const col = scols && scols[0]
    if (col && col.Type && col.Type.includes('SYNC_PENDING')) {
      // 先把存量 SYNC_PENDING（待同步）记录归入 CHANGED，保证枚举收缩可执行
      await prisma.$executeRawUnsafe(`UPDATE \`DataRecord\` SET \`status\`='CHANGED' WHERE \`status\`='SYNC_PENDING'`)
      await prisma.$executeRawUnsafe(`ALTER TABLE \`DataRecord\` MODIFY COLUMN \`status\` ENUM('DRAFT','SUBMITTED','REVIEWED','REJECTED','ARCHIVED','PENDING_APPROVAL','CHANGED') NOT NULL DEFAULT 'DRAFT'`)
      console.log('   ✅ DataRecord.status 已移除 SYNC_PENDING')
    } else {
      console.log('   ⚠️  DataRecord.status 不含 SYNC_PENDING 或列不存在，跳过')
    }
  } catch (e) {
    console.log('   ⚠️  DataRecord.status 枚举迁移跳过:', e.message)
  }

  // ==================== 42. ExportTemplate.documentFileKey / spreadsheetFileKey（ONLYOFFICE 文件化模板） ====================
  console.log('\n42. ExportTemplate 增加 documentFileKey/spreadsheetFileKey（ONLYOFFICE 文件化模板）...')
  try {
    const [dc] = await prisma.$queryRawUnsafe(`SHOW COLUMNS FROM \`ExportTemplate\` LIKE 'documentFileKey'`)
    if (!dc) {
      await prisma.$executeRawUnsafe(`ALTER TABLE \`ExportTemplate\` ADD COLUMN \`documentFileKey\` VARCHAR(191) NULL`)
      console.log('   ✅ ExportTemplate.documentFileKey 添加完成')
    } else {
      console.log('   ⚠️  ExportTemplate.documentFileKey 已存在，跳过')
    }
  } catch (e) {
    console.log('   ⚠️  ExportTemplate.documentFileKey 迁移跳过:', e.message)
  }
  try {
    const [sc] = await prisma.$queryRawUnsafe(`SHOW COLUMNS FROM \`ExportTemplate\` LIKE 'spreadsheetFileKey'`)
    if (!sc) {
      await prisma.$executeRawUnsafe(`ALTER TABLE \`ExportTemplate\` ADD COLUMN \`spreadsheetFileKey\` VARCHAR(191) NULL`)
      console.log('   ✅ ExportTemplate.spreadsheetFileKey 添加完成')
    } else {
      console.log('   ⚠️  ExportTemplate.spreadsheetFileKey 已存在，跳过')
    }
  } catch (e) {
    console.log('   ⚠️  ExportTemplate.spreadsheetFileKey 迁移跳过:', e.message)
  }

  console.log('\n✅ 数据库迁移完成！')
}

async function createUser(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`User\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`username\` VARCHAR(191) NOT NULL UNIQUE,
      \`passwordHash\` VARCHAR(191) NOT NULL,
      \`realName\` VARCHAR(191) NOT NULL,
      \`phone\` VARCHAR(191) NULL,
      \`email\` VARCHAR(191) NULL,
      \`roleId\` INT NOT NULL,
      \`status\` ENUM('ACTIVE','DISABLED') NOT NULL DEFAULT 'ACTIVE',
      \`avatar\` VARCHAR(191) NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      \`createdBy\` INT NULL,
      INDEX \`User_username_idx\` (\`username\`),
      INDEX \`User_roleId_idx\` (\`roleId\`),
      CONSTRAINT \`User_roleId_fkey\` FOREIGN KEY (\`roleId\`) REFERENCES \`Role\`(\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

async function createTableCategory(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`TableCategory\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`name\` VARCHAR(191) NOT NULL,
      \`parentId\` INT NULL,
      \`level\` INT NOT NULL DEFAULT 1,
      \`sortOrder\` INT NOT NULL DEFAULT 0,
      \`icon\` VARCHAR(191) NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      INDEX \`TableCategory_parentId_idx\` (\`parentId\`),
      INDEX \`TableCategory_sortOrder_idx\` (\`sortOrder\`),
      INDEX \`TableCategory_level_idx\` (\`level\`),
      CONSTRAINT \`TableCategory_parentId_fkey\` FOREIGN KEY (\`parentId\`) REFERENCES \`TableCategory\`(\`id\`) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

async function createDataTable(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`DataTable\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`name\` VARCHAR(191) NOT NULL UNIQUE,
      \`label\` VARCHAR(191) NOT NULL,
      \`description\` TEXT NULL,
      \`icon\` VARCHAR(191) NULL,
      \`categoryId\` INT NULL,
      \`status\` ENUM('ACTIVE','ARCHIVED','DRAFT') NOT NULL DEFAULT 'ACTIVE',
      \`sortOrder\` INT NOT NULL DEFAULT 0,
      \`isDetailTable\` TINYINT(1) NOT NULL DEFAULT 0,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      \`createdBy\` INT NULL,
      INDEX \`DataTable_status_idx\` (\`status\`),
      INDEX \`DataTable_sortOrder_idx\` (\`sortOrder\`),
      INDEX \`DataTable_categoryId_idx\` (\`categoryId\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

async function createTableField(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`TableField\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`tableId\` INT NOT NULL,
      \`name\` VARCHAR(191) NOT NULL,
      \`label\` VARCHAR(191) NOT NULL,
      \`type\` ENUM('TEXT','TEXTAREA','NUMBER','INTEGER','FLOAT','DATE','DATETIME','SELECT','RADIO','MULTISELECT','CHECKBOX','UPLOAD_IMAGE','UPLOAD_FILE','PHONE','EMAIL','IDCARD','ADDRESS','MONEY','SWITCH','RICHTEXT','RELATION','DETAIL_TABLE','LEVY_RELATION') NOT NULL,
      \`required\` TINYINT(1) NOT NULL DEFAULT 0,
      \`unique\` TINYINT(1) NOT NULL DEFAULT 0,
      \`sortOrder\` INT NOT NULL DEFAULT 0,
      \`description\` TEXT NULL,
      \`placeholder\` VARCHAR(191) NULL,
      \`defaultValue\` TEXT NULL,
      \`options\` JSON NULL,
      \`validation\` JSON NULL,
      \`config\` JSON NULL,
      \`isSystem\` TINYINT(1) NOT NULL DEFAULT 0,
      \`showInList\` TINYINT(1) NOT NULL DEFAULT 1,
      \`showInForm\` TINYINT(1) NOT NULL DEFAULT 1,
      \`showInSearch\` TINYINT(1) NOT NULL DEFAULT 1,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      INDEX \`TableField_tableId_idx\` (\`tableId\`),
      INDEX \`TableField_sortOrder_idx\` (\`sortOrder\`),
      CONSTRAINT \`TableField_tableId_fkey\` FOREIGN KEY (\`tableId\`) REFERENCES \`DataTable\`(\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

async function createTablePermission(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`TablePermission\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`userId\` INT NOT NULL,
      \`tableId\` INT NOT NULL,
      \`canView\` TINYINT(1) NOT NULL DEFAULT 1,
      \`canCreate\` TINYINT(1) NOT NULL DEFAULT 0,
      \`canEdit\` TINYINT(1) NOT NULL DEFAULT 0,
      \`canDelete\` TINYINT(1) NOT NULL DEFAULT 0,
      \`canExportExcel\` TINYINT(1) NOT NULL DEFAULT 0,
      \`canExportPdf\` TINYINT(1) NOT NULL DEFAULT 0,
      \`canPrint\` TINYINT(1) NOT NULL DEFAULT 0,
      \`canImport\` TINYINT(1) NOT NULL DEFAULT 0,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE INDEX \`TablePermission_userId_tableId_key\` (\`userId\`, \`tableId\`),
      INDEX \`TablePermission_tableId_idx\` (\`tableId\`),
      CONSTRAINT \`TablePermission_userId_fkey\` FOREIGN KEY (\`userId\`) REFERENCES \`User\`(\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`TablePermission_tableId_fkey\` FOREIGN KEY (\`tableId\`) REFERENCES \`DataTable\`(\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

async function createDataRecord(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`DataRecord\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`tableId\` INT NOT NULL,
      \`data\` JSON NOT NULL,
      \`status\` ENUM('DRAFT','SUBMITTED','REVIEWED','REJECTED','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      \`createdBy\` INT NULL,
      \`updatedBy\` INT NULL,
      INDEX \`DataRecord_tableId_idx\` (\`tableId\`),
      INDEX \`DataRecord_createdAt_idx\` (\`createdAt\`),
      INDEX \`DataRecord_createdBy_idx\` (\`createdBy\`),
      INDEX \`DataRecord_status_idx\` (\`status\`),
      CONSTRAINT \`DataRecord_tableId_fkey\` FOREIGN KEY (\`tableId\`) REFERENCES \`DataTable\`(\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`DataRecord_createdBy_fkey\` FOREIGN KEY (\`createdBy\`) REFERENCES \`User\`(\`id\`) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

async function createRecordAttachment(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`RecordAttachment\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`tableId\` INT NOT NULL,
      \`recordId\` INT NOT NULL,
      \`type\` ENUM('IMAGE','FILE','OTHER') NOT NULL DEFAULT 'OTHER',
      \`displayName\` VARCHAR(191) NOT NULL,
      \`originalName\` VARCHAR(191) NOT NULL,
      \`fileName\` VARCHAR(191) NOT NULL,
      \`filePath\` TEXT NOT NULL,
      \`fileSize\` INT NOT NULL,
      \`mimeType\` VARCHAR(191) NOT NULL,
      \`uploadedBy\` INT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX \`RecordAttachment_tableId_idx\` (\`tableId\`),
      INDEX \`RecordAttachment_recordId_idx\` (\`recordId\`),
      INDEX \`RecordAttachment_createdAt_idx\` (\`createdAt\`),
      CONSTRAINT \`RecordAttachment_tableId_fkey\` FOREIGN KEY (\`tableId\`) REFERENCES \`DataTable\`(\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`RecordAttachment_recordId_fkey\` FOREIGN KEY (\`recordId\`) REFERENCES \`DataRecord\`(\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`RecordAttachment_uploadedBy_fkey\` FOREIGN KEY (\`uploadedBy\`) REFERENCES \`User\`(\`id\`) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

async function createUploadedFile(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`UploadedFile\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`tableId\` INT NULL,
      \`recordId\` INT NULL,
      \`fieldName\` VARCHAR(191) NULL,
      \`originalName\` VARCHAR(191) NOT NULL,
      \`fileName\` VARCHAR(191) NOT NULL,
      \`filePath\` TEXT NOT NULL,
      \`fileSize\` INT NOT NULL,
      \`mimeType\` VARCHAR(191) NOT NULL,
      \`fileType\` ENUM('IMAGE','DOCUMENT','VIDEO','AUDIO','OTHER') NOT NULL DEFAULT 'OTHER',
      \`uploadedBy\` INT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX \`UploadedFile_tableId_idx\` (\`tableId\`),
      INDEX \`UploadedFile_recordId_idx\` (\`recordId\`),
      INDEX \`UploadedFile_createdAt_idx\` (\`createdAt\`),
      CONSTRAINT \`UploadedFile_tableId_fkey\` FOREIGN KEY (\`tableId\`) REFERENCES \`DataTable\`(\`id\`) ON DELETE SET NULL,
      CONSTRAINT \`UploadedFile_recordId_fkey\` FOREIGN KEY (\`recordId\`) REFERENCES \`DataRecord\`(\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`UploadedFile_uploadedBy_fkey\` FOREIGN KEY (\`uploadedBy\`) REFERENCES \`User\`(\`id\`) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

async function createOperationLog(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`OperationLog\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`userId\` INT NULL,
      \`action\` VARCHAR(191) NOT NULL,
      \`module\` VARCHAR(191) NOT NULL,
      \`tableId\` INT NULL,
      \`recordId\` INT NULL,
      \`detail\` JSON NULL,
      \`ipAddress\` VARCHAR(191) NULL,
      \`userAgent\` TEXT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX \`OperationLog_userId_idx\` (\`userId\`),
      INDEX \`OperationLog_action_idx\` (\`action\`),
      INDEX \`OperationLog_module_idx\` (\`module\`),
      INDEX \`OperationLog_createdAt_idx\` (\`createdAt\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

async function createErrorLog(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`ErrorLog\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`userId\` INT NULL,
      \`level\` VARCHAR(191) NOT NULL,
      \`module\` VARCHAR(191) NOT NULL,
      \`action\` VARCHAR(191) NOT NULL,
      \`message\` TEXT NOT NULL,
      \`stackTrace\` TEXT NULL,
      \`requestUrl\` TEXT NULL,
      \`requestMethod\` VARCHAR(191) NULL,
      \`requestParams\` JSON NULL,
      \`tableId\` INT NULL,
      \`recordId\` INT NULL,
      \`ipAddress\` VARCHAR(191) NULL,
      \`userAgent\` TEXT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX \`ErrorLog_userId_idx\` (\`userId\`),
      INDEX \`ErrorLog_level_idx\` (\`level\`),
      INDEX \`ErrorLog_module_idx\` (\`module\`),
      INDEX \`ErrorLog_createdAt_idx\` (\`createdAt\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

async function createExportTemplate(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`ExportTemplate\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`tableId\` INT NOT NULL,
      \`name\` VARCHAR(191) NOT NULL,
      \`type\` ENUM('STANDARD','CARD','GROUPED','FORM') NOT NULL,
      \`category\` VARCHAR(191) NOT NULL DEFAULT 'EXPORT',
      \`description\` TEXT NULL,
      \`config\` JSON NOT NULL,
      \`isDefault\` TINYINT(1) NOT NULL DEFAULT 0,
      \`isSystem\` TINYINT(1) NOT NULL DEFAULT 0,
      \`isShared\` TINYINT(1) NOT NULL DEFAULT 0,
      \`createdBy\` INT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      INDEX \`ExportTemplate_tableId_idx\` (\`tableId\`),
      INDEX \`ExportTemplate_category_idx\` (\`category\`),
      INDEX \`ExportTemplate_createdBy_idx\` (\`createdBy\`),
      INDEX \`ExportTemplate_isShared_idx\` (\`isShared\`),
      CONSTRAINT \`ExportTemplate_tableId_fkey\` FOREIGN KEY (\`tableId\`) REFERENCES \`DataTable\`(\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

async function createSystemSetting(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`SystemSetting\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`key\` VARCHAR(191) NOT NULL UNIQUE,
      \`value\` TEXT NOT NULL,
      \`description\` TEXT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      INDEX \`SystemSetting_key_idx\` (\`key\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  
  await prisma.$executeRawUnsafe(`
    INSERT INTO \`SystemSetting\` (\`key\`, \`value\`, \`description\`, \`updatedAt\`)
    VALUES ('sessionTimeout', '30', '用户不操作自动退出时间（分钟）', NOW())
    ON DUPLICATE KEY UPDATE \`value\`=VALUES(\`value\`), \`updatedAt\`=NOW()
  `)
}

async function createUserDashboardConfig(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`UserDashboardConfig\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`userId\` INT NOT NULL UNIQUE,
      \`config\` JSON NOT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      INDEX \`UserDashboardConfig_userId_idx\` (\`userId\`),
      CONSTRAINT \`UserDashboardConfig_userId_fkey\` FOREIGN KEY (\`userId\`) REFERENCES \`User\`(\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

async function createUserSession(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`UserSession\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`userId\` INT NOT NULL,
      \`token\` TEXT NOT NULL,
      \`ipAddress\` VARCHAR(191) NULL,
      \`userAgent\` TEXT NULL,
      \`deviceInfo\` JSON NULL,
      \`isActive\` TINYINT(1) NOT NULL DEFAULT 1,
      \`lastActiveAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`expiresAt\` DATETIME(3) NULL,
      INDEX \`UserSession_userId_idx\` (\`userId\`),
      INDEX \`UserSession_isActive_idx\` (\`isActive\`),
      CONSTRAINT \`UserSession_userId_fkey\` FOREIGN KEY (\`userId\`) REFERENCES \`User\`(\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

async function createSharedTemplates(prisma) {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`_SharedTemplates\` (
        \`A\` INT NOT NULL,
        \`B\` INT NOT NULL,
        UNIQUE INDEX \`_SharedTemplates_AB_unique\` (\`A\`, \`B\`),
        INDEX \`_SharedTemplates_B_index\` (\`B\`),
        CONSTRAINT \`_SharedTemplates_A_fkey\` FOREIGN KEY (\`A\`) REFERENCES \`ExportTemplate\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`_SharedTemplates_B_fkey\` FOREIGN KEY (\`B\`) REFERENCES \`DataTable\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
  } catch (e) {
    console.log('   _SharedTemplates 表跳过:', e.message)
  }
}

main()
  .catch((e) => {
    console.error('⚠️ 迁移警告（非致命）:', e.message)
    console.error('   继续启动应用...')
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
