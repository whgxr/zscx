import { PrismaClient, FieldType, TableStatus, RecordStatus } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('开始初始化数据库...')

  // 创建默认角色
  const adminRole = await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: {},
    create: {
      name: 'ADMIN',
      label: '超级管理员',
      description: '系统超级管理员，拥有所有权限',
      canManageTables: true,
      canManageUsers: true,
      canManagePermissions: true,
      canManageTemplates: true,
      canViewLogs: true,
      canManageSettings: true,
      isSystem: true,
      sortOrder: 1,
    },
  })

  const managerRole = await prisma.role.upsert({
    where: { name: 'MANAGER' },
    update: {},
    create: {
      name: 'MANAGER',
      label: '管理员',
      description: '系统管理员，可管理数据和用户',
      canManageTables: true,
      canManageUsers: true,
      canManagePermissions: false,
      canManageTemplates: true,
      canViewLogs: true,
      canManageSettings: false,
      isSystem: true,
      sortOrder: 2,
    },
  })

  const userRole = await prisma.role.upsert({
    where: { name: 'USER' },
    update: {},
    create: {
      name: 'USER',
      label: '录入员',
      description: '数据录入员，可录入和编辑数据',
      canManageTables: false,
      canManageUsers: false,
      canManagePermissions: false,
      canManageTemplates: false,
      canViewLogs: false,
      canManageSettings: false,
      isSystem: true,
      sortOrder: 3,
    },
  })

  const viewerRole = await prisma.role.upsert({
    where: { name: 'VIEWER' },
    update: {},
    create: {
      name: 'VIEWER',
      label: '查看员',
      description: '数据查看员，仅可查看数据',
      canManageTables: false,
      canManageUsers: false,
      canManagePermissions: false,
      canManageTemplates: false,
      canViewLogs: false,
      canManageSettings: false,
      isSystem: true,
      sortOrder: 4,
    },
  })

  // 创建默认管理员
  const adminPassword = await bcrypt.hash('admin123', 10)
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      passwordHash: adminPassword,
      realName: '系统管理员',
      roleId: adminRole.id,
      phone: '13800138000',
    },
  })
  console.log('✅ 默认管理员创建成功: admin / admin123')

  // 创建示例数据表 - 住户信息表
  const householdTable = await prisma.dataTable.upsert({
    where: { name: 'household' },
    update: {},
    create: {
      name: 'household',
      label: '住户信息表',
      description: '征收范围内的住户基本信息',
      icon: 'home',
      status: TableStatus.ACTIVE,
      sortOrder: 1,
      createdBy: admin.id,
      fields: {
        create: [
          {
            name: 'name',
            label: '姓名',
            type: FieldType.TEXT,
            required: true,
            sortOrder: 1,
            placeholder: '请输入姓名',
            isSystem: false,
            showInList: true,
            showInForm: true,
            showInSearch: true,
          },
          {
            name: 'id_card',
            label: '身份证号',
            type: FieldType.IDCARD,
            required: true,
            sortOrder: 2,
            placeholder: '请输入身份证号',
            isSystem: false,
            showInList: true,
            showInForm: true,
            showInSearch: true,
          },
          {
            name: 'phone',
            label: '联系电话',
            type: FieldType.PHONE,
            required: true,
            sortOrder: 3,
            placeholder: '请输入手机号',
            isSystem: false,
            showInList: true,
            showInForm: true,
            showInSearch: true,
          },
          {
            name: 'address',
            label: '房屋地址',
            type: FieldType.ADDRESS,
            required: true,
            sortOrder: 4,
            placeholder: '请输入详细地址',
            isSystem: false,
            showInList: true,
            showInForm: true,
            showInSearch: true,
          },
          {
            name: 'house_area',
            label: '房屋面积(㎡)',
            type: FieldType.FLOAT,
            required: true,
            sortOrder: 5,
            placeholder: '请输入房屋面积',
            isSystem: false,
            showInList: true,
            showInForm: true,
            showInSearch: false,
          },
          {
            name: 'house_type',
            label: '房屋类型',
            type: FieldType.SELECT,
            required: true,
            sortOrder: 6,
            isSystem: false,
            showInList: true,
            showInForm: true,
            showInSearch: true,
            options: [
              { label: '住宅', value: 'residential' },
              { label: '商业', value: 'commercial' },
              { label: '工业', value: 'industrial' },
              { label: '其他', value: 'other' },
            ],
          },
          {
            name: 'house_photos',
            label: '房屋照片',
            type: FieldType.UPLOAD_IMAGE,
            required: false,
            sortOrder: 7,
            isSystem: false,
            showInList: false,
            showInForm: true,
            showInSearch: false,
          },
          {
            name: 'compensation_amount',
            label: '补偿金额(元)',
            type: FieldType.MONEY,
            required: false,
            sortOrder: 8,
            placeholder: '请输入补偿金额',
            isSystem: false,
            showInList: true,
            showInForm: true,
            showInSearch: false,
          },
          {
            name: 'remark',
            label: '备注',
            type: FieldType.TEXTAREA,
            required: false,
            sortOrder: 9,
            placeholder: '请输入备注信息',
            isSystem: false,
            showInList: false,
            showInForm: true,
            showInSearch: false,
          },
        ],
      },
    },
  })
  console.log('✅ 示例数据表创建成功: 住户信息表')

  // 创建示例数据表 - 土地信息表
  const landTable = await prisma.dataTable.upsert({
    where: { name: 'land' },
    update: {},
    create: {
      name: 'land',
      label: '土地信息表',
      description: '征收范围内的土地信息',
      icon: 'map',
      status: TableStatus.ACTIVE,
      sortOrder: 2,
      createdBy: admin.id,
      fields: {
        create: [
          {
            name: 'land_no',
            label: '宗地编号',
            type: FieldType.TEXT,
            required: true,
            sortOrder: 1,
            placeholder: '请输入宗地编号',
            isSystem: false,
            showInList: true,
            showInForm: true,
            showInSearch: true,
          },
          {
            name: 'land_area',
            label: '土地面积(㎡)',
            type: FieldType.FLOAT,
            required: true,
            sortOrder: 2,
            placeholder: '请输入土地面积',
            isSystem: false,
            showInList: true,
            showInForm: true,
            showInSearch: false,
          },
          {
            name: 'land_type',
            label: '土地用途',
            type: FieldType.SELECT,
            required: true,
            sortOrder: 3,
            isSystem: false,
            showInList: true,
            showInForm: true,
            showInSearch: true,
            options: [
              { label: '住宅用地', value: 'residential' },
              { label: '商业用地', value: 'commercial' },
              { label: '工业用地', value: 'industrial' },
              { label: '农用地', value: 'agricultural' },
              { label: '其他', value: 'other' },
            ],
          },
          {
            name: 'owner',
            label: '权利人',
            type: FieldType.TEXT,
            required: true,
            sortOrder: 4,
            placeholder: '请输入权利人姓名',
            isSystem: false,
            showInList: true,
            showInForm: true,
            showInSearch: true,
          },
          {
            name: 'certificate_no',
            label: '证号',
            type: FieldType.TEXT,
            required: false,
            sortOrder: 5,
            placeholder: '请输入土地证书号',
            isSystem: false,
            showInList: true,
            showInForm: true,
            showInSearch: true,
          },
          {
            name: 'land_photos',
            label: '现场照片',
            type: FieldType.UPLOAD_IMAGE,
            required: false,
            sortOrder: 6,
            isSystem: false,
            showInList: false,
            showInForm: true,
            showInSearch: false,
          },
          {
            name: 'remark',
            label: '备注',
            type: FieldType.TEXTAREA,
            required: false,
            sortOrder: 7,
            placeholder: '请输入备注',
            isSystem: false,
            showInList: false,
            showInForm: true,
            showInSearch: false,
          },
        ],
      },
    },
  })
  console.log('✅ 示例数据表创建成功: 土地信息表')

  // 创建示例用户
  const userPassword = await bcrypt.hash('123456', 10)
  await prisma.user.upsert({
    where: { username: 'user01' },
    update: {},
    create: {
      username: 'user01',
      passwordHash: userPassword,
      realName: '张录入',
      roleId: userRole.id,
      phone: '13800138001',
      createdBy: admin.id,
      tablePermissions: {
        create: [
          {
            tableId: householdTable.id,
            canView: true,
            canCreate: true,
            canEdit: true,
            canDelete: false,
            canExport: true,
          },
          {
            tableId: landTable.id,
            canView: true,
            canCreate: true,
            canEdit: true,
            canDelete: false,
            canExport: true,
          },
        ],
      },
    },
  })
  console.log('✅ 示例录入员创建成功: user01 / 123456')

  await prisma.user.upsert({
    where: { username: 'viewer01' },
    update: {},
    create: {
      username: 'viewer01',
      passwordHash: userPassword,
      realName: '李查看',
      roleId: viewerRole.id,
      phone: '13800138002',
      createdBy: admin.id,
      tablePermissions: {
        create: [
          {
            tableId: householdTable.id,
            canView: true,
            canCreate: false,
            canEdit: false,
            canDelete: false,
            canExport: true,
          },
        ],
      },
    },
  })
  console.log('✅ 示例查看员创建成功: viewer01 / 123456')

  console.log('🎉 数据库初始化完成！')
  console.log('')
  console.log('默认账号:')
  console.log('  管理员: admin / admin123')
  console.log('  录入员: user01 / 123456')
  console.log('  查看员: viewer01 / 123456')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
