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
      `INSERT INTO \`Role\` (\`name\`, \`label\`, \`description\`, \`canManageTables\`, \`canManageUsers\`, \`canManagePermissions\`, \`canManageTemplates\`, \`canViewLogs\`, \`canManageSettings\`, \`isSystem\`, \`sortOrder\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE \`label\`=VALUES(\`label\`)`,
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

  // TableField type 枚举添加 DETAIL_TABLE
  if (tableNames.includes('tablefield')) {
    const tfCols = await prisma.$queryRaw`DESCRIBE \`TableField\``
    const typeCol = tfCols.find(c => c.Field === 'type')
    if (typeCol && typeCol.Type && !typeCol.Type.includes('DETAIL_TABLE')) {
      console.log('   给 TableField.type 添加 DETAIL_TABLE 枚举值')
      await prisma.$executeRawUnsafe("ALTER TABLE `TableField` MODIFY COLUMN `type` ENUM('TEXT','TEXTAREA','NUMBER','INTEGER','FLOAT','DATE','DATETIME','SELECT','RADIO','MULTISELECT','CHECKBOX','UPLOAD_IMAGE','UPLOAD_FILE','PHONE','EMAIL','IDCARD','ADDRESS','MONEY','SWITCH','RICHTEXT','RELATION','DETAIL_TABLE') NOT NULL")
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
      INSERT INTO \`SystemSetting\` (\`key\`, \`value\`, \`description\`)
      VALUES ('sessionTimeout', '30', '用户不操作自动退出时间（分钟）')
      ON DUPLICATE KEY UPDATE \`value\`=VALUES(\`value\`)
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
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`ApprovalNode\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`workflowId\` INT NOT NULL,
        \`nodeType\` ENUM('ROLE','USER','FIELD','CONDITION') NOT NULL,
        \`nodeOrder\` INT NOT NULL,
        \`nodeName\` VARCHAR(191) NOT NULL,
        \`roleId\` INT NULL,
        \`userId\` INT NULL,
        \`fieldName\` VARCHAR(191) NULL,
        \`canView\` TINYINT(1) NOT NULL DEFAULT 1,
        \`canEdit\` TINYINT(1) NOT NULL DEFAULT 0,
        \`canApprove\` TINYINT(1) NOT NULL DEFAULT 1,
        \`canTransfer\` TINYINT(1) NOT NULL DEFAULT 1,
        \`timeout\` INT NULL,
        \`timeoutAction\` ENUM('AUTO_PASS','AUTO_REJECT','NONE') NULL,
        \`conditionField\` VARCHAR(191) NULL,
        \`conditionOp\` VARCHAR(191) NULL,
        \`conditionValue\` VARCHAR(191) NULL,
        \`nextNodeTrue\` INT NULL,
        \`nextNodeFalse\` INT NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX \`ApprovalNode_workflowId_idx\` (\`workflowId\`),
        INDEX \`ApprovalNode_nodeOrder_idx\` (\`nodeOrder\`),
        CONSTRAINT \`ApprovalNode_workflowId_fkey\` FOREIGN KEY (\`workflowId\`) REFERENCES \`ApprovalWorkflow\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`ApprovalNode_roleId_fkey\` FOREIGN KEY (\`roleId\`) REFERENCES \`Role\`(\`id\`) ON DELETE SET NULL,
        CONSTRAINT \`ApprovalNode_userId_fkey\` FOREIGN KEY (\`userId\`) REFERENCES \`User\`(\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    console.log('   ✅ ApprovalNode 表创建完成')
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
  if (hasUserTable || tableNames.includes('user')) {
    const userCount = await prisma.$queryRaw`SELECT COUNT(*) as c FROM \`User\``
    if (userCount[0].c === 0) {
      console.log('5. 创建默认管理员...')
      const passwordHash = await bcrypt.hash('admin123', 10)
      await prisma.$executeRawUnsafe(`
        INSERT INTO \`User\` (\`username\`, \`passwordHash\`, \`realName\`, \`roleId\`, \`phone\`)
        VALUES ('admin', ?, '系统管理员', 
          (SELECT \`id\` FROM \`Role\` WHERE \`name\` = 'ADMIN'),
          '13800138000')
      `, passwordHash)
      console.log('   ✅ 默认管理员: admin / admin123')
    }
  }

  console.log('\n✅ 数据库迁移完成！')
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
      \`type\` ENUM('TEXT','TEXTAREA','NUMBER','INTEGER','FLOAT','DATE','DATETIME','SELECT','RADIO','MULTISELECT','CHECKBOX','UPLOAD_IMAGE','UPLOAD_FILE','PHONE','EMAIL','IDCARD','ADDRESS','MONEY','SWITCH','RICHTEXT','RELATION','DETAIL_TABLE') NOT NULL,
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
    INSERT INTO \`SystemSetting\` (\`key\`, \`value\`, \`description\`)
    VALUES ('sessionTimeout', '30', '用户不操作自动退出时间（分钟）')
    ON DUPLICATE KEY UPDATE \`value\`=VALUES(\`value\`)
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
    console.error('❌ 迁移失败:', e.message)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
