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
    ['DataTable', createDataTable],
    ['TableField', createTableField],
    ['TablePermission', createTablePermission],
    ['DataRecord', createDataRecord],
    ['UploadedFile', createUploadedFile],
    ['OperationLog', createOperationLog],
    ['ExportTemplate', createExportTemplate],
    ['SystemSetting', createSystemSetting],
  ]

  for (const [name, createFn] of tableChecks) {
    if (!tableNames.includes(name.toLowerCase())) {
      console.log(`3. 创建 ${name} 表...`)
      await createFn(prisma)
    }
  }

  // ==================== 4. 检查并添加缺失的列 ====================
  console.log('4. 检查字段...')
  
  // TablePermission 添加 canPrint
  if (tableNames.includes('tablepermission')) {
    const permCols = await prisma.$queryRaw`DESCRIBE \`TablePermission\``
    if (!permCols.some(c => c.Field === 'canPrint')) {
      console.log('   给 TablePermission 添加 canPrint 字段')
      await prisma.$executeRawUnsafe('ALTER TABLE `TablePermission` ADD COLUMN `canPrint` TINYINT(1) NOT NULL DEFAULT 0')
    }
  }

  // ExportTemplate 添加 isShared
  if (tableNames.includes('exporttemplate')) {
    const etCols = await prisma.$queryRaw`DESCRIBE \`ExportTemplate\``
    if (!etCols.some(c => c.Field === 'isShared')) {
      console.log('   给 ExportTemplate 添加 isShared 字段')
      await prisma.$executeRawUnsafe('ALTER TABLE `ExportTemplate` ADD COLUMN `isShared` TINYINT(1) NOT NULL DEFAULT 0')
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

  // ==================== 5. 创建默认管理员（如果没有用户） ====================
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

async function createDataTable(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`DataTable\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`name\` VARCHAR(191) NOT NULL UNIQUE,
      \`label\` VARCHAR(191) NOT NULL,
      \`description\` TEXT NULL,
      \`icon\` VARCHAR(191) NULL,
      \`status\` ENUM('ACTIVE','ARCHIVED','DRAFT') NOT NULL DEFAULT 'ACTIVE',
      \`sortOrder\` INT NOT NULL DEFAULT 0,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      \`createdBy\` INT NULL,
      INDEX \`DataTable_status_idx\` (\`status\`),
      INDEX \`DataTable_sortOrder_idx\` (\`sortOrder\`)
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
      \`type\` ENUM('TEXT','TEXTAREA','NUMBER','INTEGER','FLOAT','DATE','DATETIME','SELECT','RADIO','MULTISELECT','CHECKBOX','UPLOAD_IMAGE','UPLOAD_FILE','PHONE','EMAIL','IDCARD','ADDRESS','MONEY','SWITCH','RICHTEXT','RELATION') NOT NULL,
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
      \`canExport\` TINYINT(1) NOT NULL DEFAULT 0,
      \`canPrint\` TINYINT(1) NOT NULL DEFAULT 0,
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

async function createExportTemplate(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`ExportTemplate\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`tableId\` INT NOT NULL,
      \`name\` VARCHAR(191) NOT NULL,
      \`type\` ENUM('STANDARD','CARD','GROUPED','FORM') NOT NULL,
      \`format\` ENUM('EXCEL','PDF') NOT NULL,
      \`description\` TEXT NULL,
      \`config\` JSON NOT NULL,
      \`isDefault\` TINYINT(1) NOT NULL DEFAULT 0,
      \`isSystem\` TINYINT(1) NOT NULL DEFAULT 0,
      \`isShared\` TINYINT(1) NOT NULL DEFAULT 0,
      \`createdBy\` INT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      INDEX \`ExportTemplate_tableId_idx\` (\`tableId\`),
      INDEX \`ExportTemplate_format_idx\` (\`format\`),
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

main()
  .catch((e) => {
    console.error('❌ 迁移失败:', e.message)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
