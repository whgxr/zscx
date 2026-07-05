-- 完整数据库创建脚本（兼容 MySQL 5.5）
-- 使用方法: D:\mysql5.5\bin\mysql.exe -u root -proot123456 < prisma/init-database.sql

CREATE DATABASE IF NOT EXISTS `zscx` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `zscx`;

-- ==================== Role 表 ====================
CREATE TABLE IF NOT EXISTS `Role` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(191) NOT NULL UNIQUE,
  `label` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `canManageTables` TINYINT(1) NOT NULL DEFAULT 0,
  `canManageUsers` TINYINT(1) NOT NULL DEFAULT 0,
  `canManagePermissions` TINYINT(1) NOT NULL DEFAULT 0,
  `canManageTemplates` TINYINT(1) NOT NULL DEFAULT 0,
  `canViewLogs` TINYINT(1) NOT NULL DEFAULT 0,
  `canManageSettings` TINYINT(1) NOT NULL DEFAULT 0,
  `isSystem` TINYINT(1) NOT NULL DEFAULT 0,
  `sortOrder` INT NOT NULL DEFAULT 0,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `Role_sortOrder_idx` (`sortOrder`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `Role` (`name`, `label`, `description`, `canManageTables`, `canManageUsers`, `canManagePermissions`, `canManageTemplates`, `canViewLogs`, `canManageSettings`, `isSystem`, `sortOrder`) VALUES
  ('ADMIN', '超级管理员', '系统超级管理员，拥有所有权限', 1, 1, 1, 1, 1, 1, 1, 1),
  ('MANAGER', '管理员', '系统管理员，可管理数据和用户', 1, 1, 0, 1, 1, 0, 1, 2),
  ('USER', '录入员', '数据录入员，可录入和编辑数据', 0, 0, 0, 0, 0, 0, 1, 3),
  ('VIEWER', '查看员', '数据查看员，仅可查看数据', 0, 0, 0, 0, 0, 0, 1, 4)
ON DUPLICATE KEY UPDATE `label`=VALUES(`label`);

-- ==================== User 表 ====================
CREATE TABLE IF NOT EXISTS `User` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `username` VARCHAR(191) NOT NULL UNIQUE,
  `passwordHash` TEXT NOT NULL,
  `realName` VARCHAR(191) NOT NULL,
  `phone` VARCHAR(191) NULL,
  `email` VARCHAR(191) NULL,
  `roleId` INT NOT NULL,
  `status` ENUM('ACTIVE','DISABLED') NOT NULL DEFAULT 'ACTIVE',
  `avatar` TEXT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `createdBy` INT NULL,
  INDEX `User_username_idx` (`username`),
  INDEX `User_roleId_idx` (`roleId`),
  CONSTRAINT `User_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==================== DataTable 表 ====================
CREATE TABLE IF NOT EXISTS `DataTable` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(191) NOT NULL UNIQUE,
  `label` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `icon` VARCHAR(191) NULL,
  `status` ENUM('ACTIVE','ARCHIVED','DRAFT') NOT NULL DEFAULT 'ACTIVE',
  `sortOrder` INT NOT NULL DEFAULT 0,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `createdBy` INT NULL,
  INDEX `DataTable_status_idx` (`status`),
  INDEX `DataTable_sortOrder_idx` (`sortOrder`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==================== TableField 表 ====================
CREATE TABLE IF NOT EXISTS `TableField` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tableId` INT NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `label` VARCHAR(191) NOT NULL,
  `type` ENUM('TEXT','TEXTAREA','NUMBER','INTEGER','FLOAT','DATE','DATETIME','SELECT','RADIO','MULTISELECT','CHECKBOX','UPLOAD_IMAGE','UPLOAD_FILE','PHONE','EMAIL','IDCARD','ADDRESS','MONEY','SWITCH','RICHTEXT','RELATION') NOT NULL,
  `required` TINYINT(1) NOT NULL DEFAULT 0,
  `unique` TINYINT(1) NOT NULL DEFAULT 0,
  `sortOrder` INT NOT NULL DEFAULT 0,
  `description` TEXT NULL,
  `placeholder` VARCHAR(191) NULL,
  `defaultValue` TEXT NULL,
  `options` LONGTEXT NULL,
  `validation` LONGTEXT NULL,
  `config` LONGTEXT NULL,
  `isSystem` TINYINT(1) NOT NULL DEFAULT 0,
  `showInList` TINYINT(1) NOT NULL DEFAULT 1,
  `showInForm` TINYINT(1) NOT NULL DEFAULT 1,
  `showInSearch` TINYINT(1) NOT NULL DEFAULT 1,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `TableField_tableId_idx` (`tableId`),
  INDEX `TableField_sortOrder_idx` (`sortOrder`),
  CONSTRAINT `TableField_tableId_fkey` FOREIGN KEY (`tableId`) REFERENCES `DataTable`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==================== TablePermission 表 ====================
CREATE TABLE IF NOT EXISTS `TablePermission` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `userId` INT NOT NULL,
  `tableId` INT NOT NULL,
  `canView` TINYINT(1) NOT NULL DEFAULT 1,
  `canCreate` TINYINT(1) NOT NULL DEFAULT 0,
  `canEdit` TINYINT(1) NOT NULL DEFAULT 0,
  `canDelete` TINYINT(1) NOT NULL DEFAULT 0,
  `canExport` TINYINT(1) NOT NULL DEFAULT 0,
  `canPrint` TINYINT(1) NOT NULL DEFAULT 0,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE INDEX `TablePermission_userId_tableId_key` (`userId`, `tableId`),
  INDEX `TablePermission_tableId_idx` (`tableId`),
  CONSTRAINT `TablePermission_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE,
  CONSTRAINT `TablePermission_tableId_fkey` FOREIGN KEY (`tableId`) REFERENCES `DataTable`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==================== DataRecord 表 ====================
CREATE TABLE IF NOT EXISTS `DataRecord` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tableId` INT NOT NULL,
  `data` LONGTEXT NOT NULL,
  `status` ENUM('DRAFT','SUBMITTED','REVIEWED','REJECTED','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `createdBy` INT NULL,
  `updatedBy` INT NULL,
  INDEX `DataRecord_tableId_idx` (`tableId`),
  INDEX `DataRecord_createdAt_idx` (`createdAt`),
  INDEX `DataRecord_createdBy_idx` (`createdBy`),
  INDEX `DataRecord_status_idx` (`status`),
  CONSTRAINT `DataRecord_tableId_fkey` FOREIGN KEY (`tableId`) REFERENCES `DataTable`(`id`) ON DELETE CASCADE,
  CONSTRAINT `DataRecord_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `User`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==================== UploadedFile 表 ====================
CREATE TABLE IF NOT EXISTS `UploadedFile` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tableId` INT NULL,
  `recordId` INT NULL,
  `fieldName` VARCHAR(191) NULL,
  `originalName` VARCHAR(191) NOT NULL,
  `fileName` VARCHAR(191) NOT NULL,
  `filePath` TEXT NOT NULL,
  `fileSize` INT NOT NULL,
  `mimeType` VARCHAR(191) NOT NULL,
  `fileType` ENUM('IMAGE','DOCUMENT','VIDEO','AUDIO','OTHER') NOT NULL DEFAULT 'OTHER',
  `uploadedBy` INT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `UploadedFile_tableId_idx` (`tableId`),
  INDEX `UploadedFile_recordId_idx` (`recordId`),
  INDEX `UploadedFile_createdAt_idx` (`createdAt`),
  CONSTRAINT `UploadedFile_tableId_fkey` FOREIGN KEY (`tableId`) REFERENCES `DataTable`(`id`) ON DELETE SET NULL,
  CONSTRAINT `UploadedFile_recordId_fkey` FOREIGN KEY (`recordId`) REFERENCES `DataRecord`(`id`) ON DELETE CASCADE,
  CONSTRAINT `UploadedFile_uploadedBy_fkey` FOREIGN KEY (`uploadedBy`) REFERENCES `User`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==================== OperationLog 表 ====================
CREATE TABLE IF NOT EXISTS `OperationLog` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `userId` INT NULL,
  `action` VARCHAR(191) NOT NULL,
  `module` VARCHAR(191) NOT NULL,
  `tableId` INT NULL,
  `recordId` INT NULL,
  `detail` LONGTEXT NULL,
  `ipAddress` VARCHAR(191) NULL,
  `userAgent` TEXT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `OperationLog_userId_idx` (`userId`),
  INDEX `OperationLog_action_idx` (`action`),
  INDEX `OperationLog_module_idx` (`module`),
  INDEX `OperationLog_createdAt_idx` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==================== ExportTemplate 表 ====================
CREATE TABLE IF NOT EXISTS `ExportTemplate` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tableId` INT NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `type` ENUM('STANDARD','CARD','GROUPED','FORM') NOT NULL,
  `format` ENUM('EXCEL','PDF') NOT NULL,
  `description` TEXT NULL,
  `config` LONGTEXT NOT NULL,
  `isDefault` TINYINT(1) NOT NULL DEFAULT 0,
  `isSystem` TINYINT(1) NOT NULL DEFAULT 0,
  `isShared` TINYINT(1) NOT NULL DEFAULT 0,
  `createdBy` INT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `ExportTemplate_tableId_idx` (`tableId`),
  INDEX `ExportTemplate_format_idx` (`format`),
  INDEX `ExportTemplate_createdBy_idx` (`createdBy`),
  INDEX `ExportTemplate_isShared_idx` (`isShared`),
  CONSTRAINT `ExportTemplate_tableId_fkey` FOREIGN KEY (`tableId`) REFERENCES `DataTable`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==================== SystemSetting 表 ====================
CREATE TABLE IF NOT EXISTS `SystemSetting` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `key` VARCHAR(191) NOT NULL UNIQUE,
  `value` TEXT NOT NULL,
  `description` TEXT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `SystemSetting_key_idx` (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `SystemSetting` (`key`, `value`, `description`) VALUES
  ('sessionTimeout', '30', '用户不操作自动退出时间（分钟）')
ON DUPLICATE KEY UPDATE `value`=VALUES(`value`);

SELECT '数据库表结构创建完成！' AS message;
