const fs = require('fs')
const path = require('path')

const envPath = path.join(__dirname, '..', '.env')
const envContent = fs.readFileSync(envPath, 'utf-8')
const lines = envContent.replace(/\r\n/g, '\n').split('\n')
lines.forEach(line => {
  line = line.trim()
  if (!line || line.startsWith('#')) return
  const eqIndex = line.indexOf('=')
  if (eqIndex === -1) return
  const key = line.substring(0, eqIndex).trim()
  let value = line.substring(eqIndex + 1).trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1)
  }
  if (!process.env[key]) process.env[key] = value
})

const mysql = require('mysql2/promise')

// MySQL 5.5 兼容：所有表只用一个 TIMESTAMP DEFAULT CURRENT_TIMESTAMP（createdAt）
// updatedAt 用 DATETIME，通过触发器自动更新
async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    port: 3308,
    user: 'root',
    password: 'root123456',
    database: 'zscx',
    multipleStatements: true
  })
  
  console.log('✅ 连接数据库成功')
  const [version] = await conn.execute('SELECT VERSION() as v')
  console.log('MySQL 版本:', version[0].v)
  
  const [tables] = await conn.execute('SHOW TABLES')
  const tableNames = tables.map(t => Object.values(t)[0].toLowerCase())
  console.log('现有表:', tableNames.join(', ') || '无')
  
  // helper: 创建 updatedAt 触发器
  async function createUpdateTrigger(tableName) {
    try {
      await conn.query(`DROP TRIGGER IF EXISTS \`${tableName}_update\``)
      await conn.query(`
        CREATE TRIGGER \`${tableName}_update\` BEFORE UPDATE ON \`${tableName}\`
        FOR EACH ROW SET NEW.\`updatedAt\` = NOW()
      `)
    } catch (e) {
      console.log(`   触发器 ${tableName}_update 创建失败:`, e.message)
    }
  }
  
  // ==================== 1. Role 表 ====================
  console.log('\n1. 创建 Role 表...')
  await conn.execute(`
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
      \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` DATETIME NULL,
      INDEX \`Role_sortOrder_idx\` (\`sortOrder\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  await createUpdateTrigger('Role')
  
  // 插入默认角色
  const roles = [
    ['ADMIN', '超级管理员', '系统超级管理员，拥有所有权限', 1, 1, 1, 1, 1, 1, 1, 1],
    ['MANAGER', '管理员', '系统管理员，可管理数据和用户', 1, 1, 0, 1, 1, 0, 1, 2],
    ['USER', '录入员', '数据录入员，可录入和编辑数据', 0, 0, 0, 0, 0, 0, 1, 3],
    ['VIEWER', '查看员', '数据查看员，仅可查看数据', 0, 0, 0, 0, 0, 0, 1, 4],
  ]
  for (const r of roles) {
    await conn.execute(
      `INSERT INTO \`Role\` (\`name\`, \`label\`, \`description\`, \`canManageTables\`, \`canManageUsers\`, \`canManagePermissions\`, \`canManageTemplates\`, \`canViewLogs\`, \`canManageSettings\`, \`isSystem\`, \`sortOrder\`, \`updatedAt\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE \`label\`=VALUES(\`label\`), \`updatedAt\`=NOW()`,
      r
    )
  }
  console.log('   ✅ Role 表完成')
  
  // ==================== 2. User 表 ====================
  console.log('\n2. 处理 User 表...')
  
  if (tableNames.includes('user')) {
    const [cols] = await conn.execute('DESCRIBE `User`')
    const colNames = cols.map(c => c.Field)
    console.log('   User 表列:', colNames.join(', '))
    
    if (!colNames.includes('roleId')) {
      await conn.execute('ALTER TABLE `User` ADD COLUMN `roleId` INT NULL')
    }
    
    if (colNames.includes('role')) {
      await conn.execute(`UPDATE \`User\` u SET u.\`roleId\` = (SELECT r.\`id\` FROM \`Role\` r WHERE r.\`name\` = u.\`role\`) WHERE u.\`roleId\` IS NULL`)
      try { await conn.execute('ALTER TABLE `User` DROP COLUMN `role`') } catch (e) {}
    }
    
    await conn.execute(`UPDATE \`User\` u SET u.\`roleId\` = (SELECT r.\`id\` FROM \`Role\` r WHERE r.\`name\` = 'USER') WHERE u.\`roleId\` IS NULL`)
    await conn.execute('ALTER TABLE `User` MODIFY COLUMN `roleId` INT NOT NULL')
  } else {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS \`User\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`username\` VARCHAR(191) NOT NULL UNIQUE,
        \`passwordHash\` TEXT NOT NULL,
        \`realName\` VARCHAR(191) NOT NULL,
        \`phone\` VARCHAR(191) NULL,
        \`email\` VARCHAR(191) NULL,
        \`roleId\` INT NOT NULL,
        \`status\` ENUM('ACTIVE','DISABLED') NOT NULL DEFAULT 'ACTIVE',
        \`avatar\` TEXT NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NULL,
        \`createdBy\` INT NULL,
        INDEX \`User_username_idx\` (\`username\`),
        INDEX \`User_roleId_idx\` (\`roleId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    await createUpdateTrigger('User')
  }
  
  try { await conn.execute('ALTER TABLE `User` ADD CONSTRAINT `User_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`)') } catch (e) {}
  console.log('   ✅ User 表完成')
  
  // ==================== 3. DataTable ====================
  if (!tableNames.includes('datatable')) {
    console.log('3. 创建 DataTable 表...')
    await conn.execute(`
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
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NULL,
        \`createdBy\` INT NULL,
        INDEX \`DataTable_status_idx\` (\`status\`),
        INDEX \`DataTable_sortOrder_idx\` (\`sortOrder\`),
        INDEX \`DataTable_categoryId_idx\` (\`categoryId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    await createUpdateTrigger('DataTable')
  } else {
    const [dtCols] = await conn.execute('DESCRIBE `DataTable`')
    const dtColNames = dtCols.map(c => c.Field)
    if (!dtColNames.includes('categoryId')) {
      await conn.execute('ALTER TABLE `DataTable` ADD COLUMN `categoryId` INT NULL')
      await conn.execute('ALTER TABLE `DataTable` ADD INDEX `DataTable_categoryId_idx` (`categoryId`)')
    }
    if (!dtColNames.includes('isDetailTable')) {
      await conn.execute('ALTER TABLE `DataTable` ADD COLUMN `isDetailTable` TINYINT(1) NOT NULL DEFAULT 0')
    }
  }
  
  // ==================== 4. TableField ====================
  if (!tableNames.includes('tablefield')) {
    console.log('4. 创建 TableField 表...')
    await conn.execute(`
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
        \`options\` LONGTEXT NULL,
        \`validation\` LONGTEXT NULL,
        \`config\` LONGTEXT NULL,
        \`isSystem\` TINYINT(1) NOT NULL DEFAULT 0,
        \`showInList\` TINYINT(1) NOT NULL DEFAULT 1,
        \`showInForm\` TINYINT(1) NOT NULL DEFAULT 1,
        \`showInSearch\` TINYINT(1) NOT NULL DEFAULT 1,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NULL,
        INDEX \`TableField_tableId_idx\` (\`tableId\`),
        INDEX \`TableField_sortOrder_idx\` (\`sortOrder\`),
        CONSTRAINT \`TableField_tableId_fkey\` FOREIGN KEY (\`tableId\`) REFERENCES \`DataTable\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    await createUpdateTrigger('TableField')
  }
  
  // ==================== 5. TablePermission ====================
  if (!tableNames.includes('tablepermission')) {
    console.log('5. 创建 TablePermission 表...')
    await conn.execute(`
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
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE INDEX \`TablePermission_userId_tableId_key\` (\`userId\`, \`tableId\`),
        INDEX \`TablePermission_tableId_idx\` (\`tableId\`),
        CONSTRAINT \`TablePermission_userId_fkey\` FOREIGN KEY (\`userId\`) REFERENCES \`User\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`TablePermission_tableId_fkey\` FOREIGN KEY (\`tableId\`) REFERENCES \`DataTable\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
  } else {
    const [permCols] = await conn.execute('DESCRIBE `TablePermission`')
    const permColNames = permCols.map(c => c.Field)
    if (!permColNames.includes('canPrint')) {
      await conn.execute('ALTER TABLE `TablePermission` ADD COLUMN `canPrint` TINYINT(1) NOT NULL DEFAULT 0')
    }
    if (!permColNames.includes('canExportExcel')) {
      await conn.execute('ALTER TABLE `TablePermission` ADD COLUMN `canExportExcel` TINYINT(1) NOT NULL DEFAULT 0')
      if (permColNames.includes('canExport')) {
        await conn.execute('UPDATE `TablePermission` SET `canExportExcel` = `canExport`')
      }
    }
    if (!permColNames.includes('canExportPdf')) {
      await conn.execute('ALTER TABLE `TablePermission` ADD COLUMN `canExportPdf` TINYINT(1) NOT NULL DEFAULT 0')
      if (permColNames.includes('canExport')) {
        await conn.execute('UPDATE `TablePermission` SET `canExportPdf` = `canExport`')
      }
    }
    if (!permColNames.includes('canImport')) {
      await conn.execute('ALTER TABLE `TablePermission` ADD COLUMN `canImport` TINYINT(1) NOT NULL DEFAULT 0')
    }
  }
  
  // ==================== 6. DataRecord ====================
  if (!tableNames.includes('datarecord')) {
    console.log('6. 创建 DataRecord 表...')
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS \`DataRecord\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`tableId\` INT NOT NULL,
        \`data\` LONGTEXT NOT NULL,
        \`status\` ENUM('DRAFT','SUBMITTED','REVIEWED','REJECTED','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NULL,
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
    await createUpdateTrigger('DataRecord')
  }
  
  // ==================== 7. UploadedFile ====================
  if (!tableNames.includes('uploadedfile')) {
    console.log('7. 创建 UploadedFile 表...')
    await conn.execute(`
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
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX \`UploadedFile_tableId_idx\` (\`tableId\`),
        INDEX \`UploadedFile_recordId_idx\` (\`recordId\`),
        INDEX \`UploadedFile_createdAt_idx\` (\`createdAt\`),
        CONSTRAINT \`UploadedFile_tableId_fkey\` FOREIGN KEY (\`tableId\`) REFERENCES \`DataTable\`(\`id\`) ON DELETE SET NULL,
        CONSTRAINT \`UploadedFile_recordId_fkey\` FOREIGN KEY (\`recordId\`) REFERENCES \`DataRecord\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`UploadedFile_uploadedBy_fkey\` FOREIGN KEY (\`uploadedBy\`) REFERENCES \`User\`(\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
  }
  
  // ==================== 8. OperationLog ====================
  if (!tableNames.includes('operationlog')) {
    console.log('8. 创建 OperationLog 表...')
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS \`OperationLog\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`userId\` INT NULL,
        \`action\` VARCHAR(191) NOT NULL,
        \`module\` VARCHAR(191) NOT NULL,
        \`tableId\` INT NULL,
        \`recordId\` INT NULL,
        \`detail\` LONGTEXT NULL,
        \`ipAddress\` VARCHAR(191) NULL,
        \`userAgent\` TEXT NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX \`OperationLog_userId_idx\` (\`userId\`),
        INDEX \`OperationLog_action_idx\` (\`action\`),
        INDEX \`OperationLog_module_idx\` (\`module\`),
        INDEX \`OperationLog_createdAt_idx\` (\`createdAt\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
  }
  
  // ==================== 9. ExportTemplate ====================
  if (!tableNames.includes('exporttemplate')) {
    console.log('9. 创建 ExportTemplate 表...')
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS \`ExportTemplate\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`tableId\` INT NOT NULL,
        \`name\` VARCHAR(191) NOT NULL,
        \`type\` ENUM('STANDARD','CARD','GROUPED','FORM') NOT NULL,
        \`format\` ENUM('EXCEL','PDF') NOT NULL,
        \`category\` VARCHAR(191) NOT NULL DEFAULT 'EXPORT',
        \`description\` TEXT NULL,
        \`config\` LONGTEXT NOT NULL,
        \`isDefault\` TINYINT(1) NOT NULL DEFAULT 0,
        \`isSystem\` TINYINT(1) NOT NULL DEFAULT 0,
        \`isShared\` TINYINT(1) NOT NULL DEFAULT 0,
        \`createdBy\` INT NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NULL,
        INDEX \`ExportTemplate_tableId_idx\` (\`tableId\`),
        INDEX \`ExportTemplate_format_idx\` (\`format\`),
        INDEX \`ExportTemplate_createdBy_idx\` (\`createdBy\`),
        INDEX \`ExportTemplate_isShared_idx\` (\`isShared\`),
        CONSTRAINT \`ExportTemplate_tableId_fkey\` FOREIGN KEY (\`tableId\`) REFERENCES \`DataTable\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    await createUpdateTrigger('ExportTemplate')
  } else {
    const [etCols] = await conn.execute('DESCRIBE `ExportTemplate`')
    if (!etCols.some(c => c.Field === 'isShared')) {
      await conn.execute('ALTER TABLE `ExportTemplate` ADD COLUMN `isShared` TINYINT(1) NOT NULL DEFAULT 0')
    }
    // category: ENUM -> VARCHAR (支持多分类逗号分隔)
    const catCol = etCols.find(c => c.Field === 'category')
    if (catCol && catCol.Type && catCol.Type.toLowerCase().startsWith('enum')) {
      console.log('   ExportTemplate.category: ENUM -> VARCHAR(191)')
      await conn.execute("ALTER TABLE `ExportTemplate` MODIFY COLUMN `category` VARCHAR(191) NOT NULL DEFAULT 'EXPORT'")
      await conn.execute("ALTER TABLE `ExportTemplate` ADD INDEX `ExportTemplate_category_idx` (`category`)")
    } else if (!catCol) {
      console.log('   给 ExportTemplate 添加 category 字段')
      await conn.execute("ALTER TABLE `ExportTemplate` ADD COLUMN `category` VARCHAR(191) NOT NULL DEFAULT 'EXPORT'")
      await conn.execute("ALTER TABLE `ExportTemplate` ADD INDEX `ExportTemplate_category_idx` (`category`)")
    }
  }
  
  // ==================== 10. SystemSetting ====================
  if (!tableNames.includes('systemsetting')) {
    console.log('10. 创建 SystemSetting 表...')
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS \`SystemSetting\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`key\` VARCHAR(191) NOT NULL UNIQUE,
        \`value\` TEXT NOT NULL,
        \`description\` TEXT NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NULL,
        INDEX \`SystemSetting_key_idx\` (\`key\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    await createUpdateTrigger('SystemSetting')
  }

  // ==================== 11. _SharedTemplates 多对多连接表 ====================
  console.log('\n11. 检查 _SharedTemplates 表...')
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS \`_SharedTemplates\` (
        \`A\` INT NOT NULL,
        \`B\` INT NOT NULL,
        UNIQUE INDEX \`_SharedTemplates_AB_unique\` (\`A\`, \`B\`),
        INDEX \`_SharedTemplates_B_index\` (\`B\`),
        CONSTRAINT \`_SharedTemplates_A_fkey\` FOREIGN KEY (\`A\`) REFERENCES \`ExportTemplate\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`_SharedTemplates_B_fkey\` FOREIGN KEY (\`B\`) REFERENCES \`DataTable\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    console.log('   ✅ _SharedTemplates 表完成')
  } catch (e) {
    console.log('   _SharedTemplates 表跳过:', e.message)
  }
  
  // ==================== 12. TableCategory 分类表 ====================
  console.log('\n12. 检查 TableCategory 表...')
  if (!tableNames.includes('tablecategory')) {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS \`TableCategory\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`name\` VARCHAR(191) NOT NULL,
        \`parentId\` INT NULL,
        \`level\` INT NOT NULL DEFAULT 1,
        \`sortOrder\` INT NOT NULL DEFAULT 0,
        \`icon\` VARCHAR(191) NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NULL,
        INDEX \`TableCategory_parentId_idx\` (\`parentId\`),
        INDEX \`TableCategory_sortOrder_idx\` (\`sortOrder\`),
        INDEX \`TableCategory_level_idx\` (\`level\`),
        CONSTRAINT \`TableCategory_parentId_fkey\` FOREIGN KEY (\`parentId\`) REFERENCES \`TableCategory\`(\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    await createUpdateTrigger('TableCategory')
    console.log('   ✅ TableCategory 表创建完成')
  } else {
    console.log('   TableCategory 表已存在')
  }
  
  // ==================== 13. UserDashboardConfig 用户仪表盘配置 ====================
  console.log('\n13. 检查 UserDashboardConfig 表...')
  if (!tableNames.includes('userdashboardconfig')) {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS \`UserDashboardConfig\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`userId\` INT NOT NULL UNIQUE,
        \`config\` LONGTEXT NOT NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NULL,
        INDEX \`UserDashboardConfig_userId_idx\` (\`userId\`),
        CONSTRAINT \`UserDashboardConfig_userId_fkey\` FOREIGN KEY (\`userId\`) REFERENCES \`User\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    await createUpdateTrigger('UserDashboardConfig')
    console.log('   ✅ UserDashboardConfig 表创建完成')
  } else {
    console.log('   UserDashboardConfig 表已存在')
  }
  
  // ==================== 15. UserSession 用户会话表 ====================
  console.log('\n15. 检查 UserSession 表...')
  if (!tableNames.includes('usersession')) {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS \`UserSession\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`userId\` INT NOT NULL,
        \`token\` TEXT NOT NULL,
        \`ipAddress\` VARCHAR(191) NULL,
        \`userAgent\` TEXT NULL,
        \`deviceInfo\` LONGTEXT NULL,
        \`isActive\` TINYINT(1) NOT NULL DEFAULT 1,
        \`lastActiveAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`createdAt\` DATETIME NULL,
        \`expiresAt\` DATETIME NULL,
        INDEX \`UserSession_userId_idx\` (\`userId\`),
        INDEX \`UserSession_isActive_idx\` (\`isActive\`),
        CONSTRAINT \`UserSession_userId_fkey\` FOREIGN KEY (\`userId\`) REFERENCES \`User\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    await createUpdateTrigger('UserSession')
    console.log('   ✅ UserSession 表创建完成')
  } else {
    console.log('   UserSession 表已存在')
  }

  await conn.execute(`INSERT INTO \`SystemSetting\` (\`key\`, \`value\`, \`description\`, \`updatedAt\`) VALUES ('sessionTimeout', '30', '用户不操作自动退出时间（分钟）', NOW()) ON DUPLICATE KEY UPDATE \`value\`=VALUES(\`value\`), \`updatedAt\`=NOW()`)
  
  // ==================== 验证 ====================
  console.log('\n✅ 迁移完成！')
  const [finalTables] = await conn.execute('SHOW TABLES')
  console.log('表列表:', finalTables.map(t => Object.values(t)[0]).join(', '))
  
  const [roleCount] = await conn.execute('SELECT COUNT(*) as c FROM `Role`')
  console.log('Role 记录数:', roleCount[0].c)
  
  await conn.end()
}

main().catch(e => {
  console.error('❌ 迁移失败:', e.message)
  process.exit(1)
})
