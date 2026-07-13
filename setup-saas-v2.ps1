# zscx-saas 项目初始化脚本 v2 (修正版)
$base = "d:\开发征收项目\zscx-saas"

function Ensure-Dir($path) {
    if (-not (Test-Path $path)) {
        New-Item -ItemType Directory -Force -Path $path | Out-Null
    }
}

function Write-File($path, $content) {
    $dir = Split-Path $path -Parent
    Ensure-Dir $dir
    # Use .NET method to avoid encoding issues
    [System.IO.File]::WriteAllText($path, $content, [System.Text.UTF8Encoding]::new($false))
    Write-Host "  OK: $($path.Replace($base, ''))"
}

Write-Host "=== zscx-saas scaffold v2 ==="

# ========== Prisma Schema ==========
Write-File "$base\packages\shared\prisma\schema.prisma" @"
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "linux-musl"]
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

model Tenant {
  id          Int          @id @default(autoincrement())
  name        String       @unique
  code        String       @unique
  status      TenantStatus @default(ACTIVE)
  config      Json?
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  users         User[]
  departments   Department[]
  dataTables    DataTable[]
  approvalFlows ApprovalFlow[]
  notificationConfigs NotificationConfig[]
  @@index([code])
}

enum TenantStatus { ACTIVE DISABLED EXPIRED }

model User {
  id            Int          @id @default(autoincrement())
  username      String       @unique
  passwordHash  String
  realName      String
  phone         String?
  email         String?
  roleId        Int
  tenantId      Int
  departmentId  Int?
  status        UserStatus   @default(ACTIVE)
  avatar        String?
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt
  createdBy     Int?
  role          Role         @relation(fields: [roleId], references: [id])
  tenant        Tenant       @relation(fields: [tenantId], references: [id])
  department    Department?  @relation(fields: [departmentId], references: [id])
  tablePermissions   TablePermission[]
  dataRecords        DataRecord[]      @relation("CreatedRecords")
  approvalRecords    ApprovalRecord[]
  notificationLogs   NotificationLog[]
  @@index([username])
  @@index([roleId])
  @@index([tenantId])
  @@index([departmentId])
}

model Role {
  id          Int      @id @default(autoincrement())
  name        String   @unique
  label       String
  description String?
  canManageTables      Boolean @default(false)
  canManageUsers       Boolean @default(false)
  canManagePermissions Boolean @default(false)
  canManageTemplates   Boolean @default(false)
  canManageDepartments Boolean @default(false)
  canManageApproval    Boolean @default(false)
  canManageSettings    Boolean @default(false)
  canViewLogs          Boolean @default(false)
  isSystem    Boolean  @default(false)
  sortOrder   Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  users       User[]
  @@index([sortOrder])
}

enum UserStatus { ACTIVE DISABLED }

model Department {
  id          Int       @id @default(autoincrement())
  tenantId    Int
  name        String
  parentId    Int?
  managerId   Int?
  sortOrder   Int       @default(0)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  tenant      Tenant      @relation(fields: [tenantId], references: [id])
  parent      Department? @relation("DeptHierarchy", fields: [parentId], references: [id])
  children    Department[] @relation("DeptHierarchy")
  manager     User?       @relation("DeptManager", fields: [managerId], references: [id])
  users       User[]
  @@index([tenantId])
  @@index([parentId])
}

model UserSession {
  id          Int       @id @default(autoincrement())
  userId      Int
  token       String    @db.Text
  ipAddress   String?
  userAgent   String?
  deviceInfo  Json?
  isActive    Boolean   @default(true)
  lastActiveAt DateTime @default(now())
  createdAt   DateTime  @default(now())
  expiresAt   DateTime?
  user        User      @relation(fields: [userId], references: [id])
  @@index([userId])
  @@index([isActive])
}

model TablePermission {
  id              Int       @id @default(autoincrement())
  userId          Int
  tableId         Int
  canView         Boolean   @default(true)
  canCreate       Boolean   @default(false)
  canEdit         Boolean   @default(false)
  canDelete       Boolean   @default(false)
  canExportExcel  Boolean   @default(false)
  canExportPdf    Boolean   @default(false)
  canPrint        Boolean   @default(false)
  canImport       Boolean   @default(false)
  createdAt       DateTime  @default(now())
  user            User      @relation(fields: [userId], references: [id])
  table           DataTable @relation(fields: [tableId], references: [id])
  @@unique([userId, tableId])
  @@index([tableId])
}

model SystemSetting {
  id          Int      @id @default(autoincrement())
  tenantId    Int?
  key         String
  value       String
  description String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@unique([tenantId, key])
  @@index([key])
}

model TableCategory {
  id        Int           @id @default(autoincrement())
  tenantId  Int
  name      String
  parentId  Int?
  level     Int           @default(1)
  sortOrder Int           @default(0)
  icon      String?
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt
  parent    TableCategory? @relation("CategoryHierarchy", fields: [parentId], references: [id])
  children  TableCategory[] @relation("CategoryHierarchy")
  tables    DataTable[]
  @@index([tenantId])
  @@index([parentId])
}

model DataTable {
  id              Int          @id @default(autoincrement())
  tenantId        Int
  name            String
  label           String
  description     String?
  icon            String?
  categoryId      Int?
  status          TableStatus  @default(ACTIVE)
  sortOrder       Int          @default(0)
  isDetailTable   Boolean      @default(false)
  formLayoutConfig Json?
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt
  createdBy       Int?
  tenant          Tenant       @relation(fields: [tenantId], references: [id])
  fields          TableField[]
  records         DataRecord[]
  permissions     TablePermission[]
  category        TableCategory? @relation(fields: [categoryId], references: [id])
  approvalFlows   ApprovalFlow[]
  exportTemplates ExportTemplate[]
  @@unique([tenantId, name])
  @@index([tenantId])
  @@index([status])
  @@index([categoryId])
}

enum TableStatus { ACTIVE ARCHIVED DRAFT }

model TableField {
  id            Int       @id @default(autoincrement())
  tableId       Int
  name          String
  label         String
  type          FieldType
  required      Boolean   @default(false)
  unique        Boolean   @default(false)
  sortOrder     Int       @default(0)
  description   String?
  placeholder   String?
  defaultValue  String?
  options       Json?
  validation    Json?
  config        Json?
  isSystem      Boolean   @default(false)
  showInList    Boolean   @default(true)
  showInForm    Boolean   @default(true)
  showInSearch  Boolean   @default(true)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  table         DataTable @relation(fields: [tableId], references: [id])
  @@index([tableId])
  @@index([sortOrder])
}

enum FieldType {
  TEXT TEXTAREA NUMBER INTEGER FLOAT DATE DATETIME
  SELECT RADIO MULTISELECT CHECKBOX
  UPLOAD_IMAGE UPLOAD_FILE
  PHONE EMAIL IDCARD ADDRESS MONEY
  SWITCH RICHTEXT RELATION DETAIL_TABLE
}

model DataRecord {
  id              Int           @id @default(autoincrement())
  tenantId        Int
  tableId         Int
  data            Json
  status          RecordStatus  @default(DRAFT)
  approvalFlowId  Int?
  currentStep     Int?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  createdBy       Int?
  updatedBy       Int?
  tenant          Tenant        @relation(fields: [tenantId], references: [id])
  table           DataTable     @relation(fields: [tableId], references: [id])
  approvalFlow    ApprovalFlow? @relation(fields: [approvalFlowId], references: [id])
  creator         User?         @relation("CreatedRecords", fields: [createdBy], references: [id])
  approvalRecords ApprovalRecord[]
  @@index([tenantId])
  @@index([tableId])
  @@index([createdBy])
  @@index([status])
}

enum RecordStatus { DRAFT SUBMITTED REVIEWED REJECTED ARCHIVED }

model ApprovalFlow {
  id          Int       @id @default(autoincrement())
  tenantId    Int
  tableId     Int
  name        String
  isActive    Boolean   @default(true)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  tenant      Tenant          @relation(fields: [tenantId], references: [id])
  table       DataTable       @relation(fields: [tableId], references: [id])
  steps       ApprovalStep[]
  records     DataRecord[]
  @@index([tenantId])
  @@index([tableId])
}

model ApprovalStep {
  id            Int            @id @default(autoincrement())
  flowId        Int
  stepOrder     Int
  approverType  ApproverType
  approverId    Int?
  approverRole  String?
  createdAt     DateTime       @default(now())
  flow          ApprovalFlow   @relation(fields: [flowId], references: [id])
  records       ApprovalRecord[]
  @@index([flowId])
}

enum ApproverType { ROLE DEPARTMENT_HEAD SPECIFIC_USER }

model ApprovalRecord {
  id          Int            @id @default(autoincrement())
  recordId    Int
  stepId      Int
  approverId  Int
  action      ApprovalAction
  comment     String?
  createdAt   DateTime       @default(now())
  record      DataRecord     @relation(fields: [recordId], references: [id])
  step        ApprovalStep   @relation(fields: [stepId], references: [id])
  approver    User           @relation(fields: [approverId], references: [id])
  @@index([recordId])
  @@index([approverId])
}

enum ApprovalAction { APPROVED REJECTED RETURNED }

model NotificationConfig {
  id          Int      @id @default(autoincrement())
  tenantId    Int
  channel     String
  isEnabled   Boolean  @default(false)
  config      Json
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  tenant      Tenant   @relation(fields: [tenantId], references: [id])
  @@unique([tenantId, channel])
}

model NotificationLog {
  id          Int      @id @default(autoincrement())
  tenantId    Int
  userId      Int
  channel     String
  type        String
  title       String
  content     String
  status      String   @default("PENDING")
  errorMsg    String?
  metadata    Json?
  createdAt   DateTime @default(now())
  user        User     @relation(fields: [userId], references: [id])
  @@index([tenantId])
  @@index([userId])
  @@index([status])
}

model UploadedFile {
  id            Int      @id @default(autoincrement())
  tableId       Int?
  recordId      Int?
  fieldName     String?
  originalName  String
  fileName      String
  filePath      String
  fileSize      Int
  mimeType      String
  fileType      FileType @default(OTHER)
  uploadedBy    Int?
  storageType   String   @default("MINIO")
  createdAt     DateTime @default(now())
  @@index([tableId])
  @@index([recordId])
}

enum FileType { IMAGE DOCUMENT VIDEO AUDIO OTHER }

model ExportTemplate {
  id           Int        @id @default(autoincrement())
  tableId      Int
  name         String
  type         ExportType
  category     String     @default("EXPORT")
  description  String?
  config       Json
  isDefault    Boolean    @default(false)
  isSystem     Boolean    @default(false)
  isShared     Boolean    @default(false)
  createdBy    Int?
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
  table        DataTable  @relation(fields: [tableId], references: [id])
  @@index([tableId])
}

enum ExportType { STANDARD CARD GROUPED FORM }

model OperationLog {
  id            Int      @id @default(autoincrement())
  tenantId      Int?
  userId        Int?
  action        String
  module        String
  tableId       Int?
  recordId      Int?
  detail        Json?
  ipAddress     String?
  userAgent     String?
  createdAt     DateTime @default(now())
  @@index([tenantId])
  @@index([userId])
  @@index([action])
  @@index([createdAt])
}

model ErrorLog {
  id            Int      @id @default(autoincrement())
  tenantId      Int?
  userId        Int?
  level         String
  module        String
  action        String
  message       String
  stackTrace    String?
  requestUrl    String?
  requestMethod String?
  requestParams Json?
  createdAt     DateTime @default(now())
  @@index([tenantId])
  @@index([level])
  @@index([createdAt])
}
"@

# ========== apps/h5 ==========
Write-File "$base\apps\h5\package.json" @"
{
  "name": "@zscx/h5",
  "version": "2.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3003",
    "build": "next build",
    "start": "next start -p 3003",
    "lint": "next lint",
    "clean": "rm -rf .next node_modules .turbo"
  },
  "dependencies": {
    "@zscx/shared": "workspace:*",
    "lucide-react": "^0.400.0",
    "next": "14.2.5",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "tailwind-merge": "^2.3.0",
    "tailwindcss-animate": "^1.0.7",
    "zod": "^3.23.8",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.1"
  },
  "devDependencies": {
    "@types/node": "^20.14.10",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.39",
    "tailwindcss": "^3.4.4",
    "typescript": "^5.5.3"
  }
}
"@

Write-File "$base\apps\h5\tsconfig.json" @"
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "jsx": "preserve",
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
"@

Write-File "$base\apps\h5\next.config.js" @"
const nextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      { source: '/api/:path*', destination: 'http://localhost:3001/api/:path*' },
    ]
  },
}
module.exports = nextConfig
"@

Write-File "$base\apps\h5\tailwind.config.js" @"
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: { extend: {} },
  plugins: [require('tailwindcss-animate')],
}
"@

Write-File "$base\apps\h5\postcss.config.js" @"
module.exports = {
  plugins: { tailwindcss: {}, autoprefixer: {} },
}
"@

Write-File "$base\apps\h5\src\app\globals.css" @"
@tailwind base;
@tailwind components;
@tailwind utilities;
"@

Write-File "$base\apps\h5\src\app\layout.tsx" @"
import type { Metadata } from 'next'
import './globals.css'
export const metadata: Metadata = {
  title: 'ZSCX SaaS - H5',
  description: '房屋征收调查系统',
}
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="bg-gray-50 min-h-screen">{children}</body>
    </html>
  )
}
"@

Write-File "$base\apps\h5\src\app\page.tsx" @"
import { redirect } from 'next/navigation'
export default function Home() { redirect('/projects'); }
"@

Write-File "$base\apps\h5\src\app\projects\page.tsx" @"
export default function ProjectsPage() {
  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">我的项目</h1>
      <div className="bg-white rounded-xl p-6 shadow-sm text-center text-gray-400">
        请先配置数据表后查看
      </div>
    </div>
  )
}
"@

Write-File "$base\apps\h5\src\app\approval\page.tsx" @"
export default function ApprovalCenterPage() {
  const tabs = ['待审批', '已审批', '我提交的']
  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">审批中心</h1>
      <div className="flex gap-2 mb-4 bg-white rounded-lg p-1 shadow-sm">
        {tabs.map(tab => (
          <button key={tab} className="flex-1 py-2 text-sm rounded-md hover:bg-gray-100">
            {tab}
          </button>
        ))}
      </div>
      <div className="bg-white rounded-xl p-6 shadow-sm text-center text-gray-400">
        暂无审批记录
      </div>
    </div>
  )
}
"@

Write-File "$base\apps\h5\src\app\settings\page.tsx" @"
export default function SettingsPage() {
  const menuItems = [
    { label: '组织架构', href: '/settings/departments' },
    { label: '项目管理', href: '/settings/projects' },
    { label: '审批配置', href: '/settings/approval' },
    { label: '通知配置', href: '/settings/notifications' },
    { label: '权限管理', href: '/settings/permissions' },
    { label: '系统设置', href: '/settings/system' },
  ]
  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">设置</h1>
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {menuItems.map((item, i) => (
          <a key={item.href} href={item.href}
            className={`flex items-center justify-between px-4 py-3 hover:bg-gray-50 ${i > 0 ? 'border-t' : ''}`}>
            <span className="text-sm">{item.label}</span>
            <span className="text-gray-300">{'>'}</span>
          </a>
        ))}
      </div>
      <div className="mt-6">
        <button className="w-full py-3 bg-red-50 text-red-500 text-sm rounded-xl">
          退出登录
        </button>
      </div>
    </div>
  )
}
"@

Write-Host "`n=== Scaffold complete! ==="
Write-Host "Files created in: $base"