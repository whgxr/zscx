import { PrismaClient, FieldType, TableStatus, RecordStatus, WorkflowStatus } from '@prisma/client'
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
            canExportExcel: true,
            canExportPdf: true,
            canImport: false,
          },
          {
            tableId: landTable.id,
            canView: true,
            canCreate: true,
            canEdit: true,
            canDelete: false,
            canExportExcel: true,
            canExportPdf: true,
            canImport: false,
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
            canExportExcel: true,
            canExportPdf: true,
            canImport: false,
          },
        ],
      },
    },
  })
  console.log('✅ 示例查看员创建成功: viewer01 / 123456')

  // ============ v1.2.2+ 调查/征收分类与示例征收协议表 ============
  console.log('\n开始初始化 v1.2.2 模块分类...')
  const surveyCategory = await prisma.tableCategory.upsert({
    where: { id: 100 },
    update: {},
    create: {
      id: 100,
      name: '调查管理',
      level: 1,
      sortOrder: 1,
      icon: 'clipboard-list',
      module: 'SURVEY',
    },
  })
  const levyCategory = await prisma.tableCategory.upsert({
    where: { id: 200 },
    update: {},
    create: {
      id: 200,
      name: '征收管理',
      level: 1,
      sortOrder: 2,
      icon: 'building-2',
      module: 'LEVY',
    },
  })
  // 把已有 household/land 挂到调查分类下
  try {
    await prisma.dataTable.updateMany({
      where: { name: { in: ['household', 'land'] }, categoryId: null },
      data: { categoryId: surveyCategory.id },
    })
  } catch (e) { /* 已有分类则跳过 */ }
  console.log('✅ 模块分类初始化完成（调查/征收）')

  // 创建示例征收表: 征收补偿协议（levy_agreement），带 LEVY_RELATION 字段
  const agreementFields = [
    { name: 'protocol_no', label: '协议编号', type: FieldType.TEXT, required: true, sortOrder: 1, placeholder: '自动生成或手动填写', showInList: true, showInForm: true, showInSearch: true },
    { name: 'sign_date', label: '签订日期', type: FieldType.DATE, required: true, sortOrder: 2, showInList: true, showInForm: true, showInSearch: true },
    { name: 'compensation_total', label: '补偿总额(元)', type: FieldType.MONEY, required: true, sortOrder: 3, showInList: true, showInForm: true, showInSearch: false },
    { name: 'payment_method', label: '付款方式', type: FieldType.SELECT, required: true, sortOrder: 4, options: [
      { label: '一次性付款', value: 'lump' },
      { label: '分期支付', value: 'installment' },
      { label: '产权调换', value: 'swap' },
    ], showInList: true, showInForm: true, showInSearch: true },
    { name: 'delivery_date', label: '交房时间', type: FieldType.DATE, required: false, sortOrder: 5, showInList: true, showInForm: true, showInSearch: false },
    { name: 'remark', label: '备注', type: FieldType.TEXTAREA, required: false, sortOrder: 99, placeholder: '补充说明', showInList: false, showInForm: true, showInSearch: false },
  ]
  const levyAgreementTable = await prisma.dataTable.upsert({
    where: { name: 'levy_agreement' },
    update: {},
    create: {
      name: 'levy_agreement',
      label: '征收补偿协议',
      description: 'v1.2.2+ 征收模块：一户一协议，关联调查住户表',
      icon: 'file-signature',
      categoryId: levyCategory.id,
      status: TableStatus.ACTIVE,
      sortOrder: 1,
      createdBy: admin.id,
      fields: {
        create: [
          // 第 0 个字段（sortOrder=0）：LEVY_RELATION 关联调查住户表
          {
            name: 'household_ref',
            label: '关联调查记录（住户）',
            type: FieldType.LEVY_RELATION,
            required: true,
            sortOrder: 0,
            description: 'LEVY_RELATION：1:1 指向住户信息表，写入时同步快照',
            config: {
              levy: {
                targetTableId: -1, // placeholder，seed 完成后下面会回填真正的 household.id
                cardinality: 'ONE_TO_ONE',
                syncMode: 'SNAPSHOT_APPROVAL',
              }
            } as any,
            showInList: true,
            showInForm: true,
            showInSearch: true,
          },
          ...agreementFields
        ]
      }
    },
  })
  // 回填 levy.targetTableId = household.id
  const householdTbl = await prisma.dataTable.findUnique({ where: { name: 'household' }, select: { id: true } })
  if (householdTbl) {
    const levyField = await prisma.tableField.findFirst({
      where: { tableId: levyAgreementTable.id, name: 'household_ref' },
    })
    if (levyField && (levyField.config as any)?.levy) {
      await prisma.tableField.update({
        where: { id: levyField.id },
        data: {
          config: {
            ...(levyField.config as any),
            levy: {
              ...(levyField.config as any).levy,
              targetTableId: householdTbl.id,
            }
          } as any
        }
      })
      console.log('✅ 征收补偿协议表 LEVY_RELATION 回填 targetTableId 成功')
    }
  }
  console.log(`✅ 示例征收表创建成功: levy_agreement (id=${levyAgreementTable.id})`)

  // ============ v1.2.2 M2：示例审批流程（征收补偿协议表 · 条件分支 + 会签） ============
  console.log('\n开始初始化 M2 示例审批流程...')
  const uuid = (() => { let n = 0; return () => `seed-node-${++n}` })()
  const k_start = uuid()
  const k_cond  = uuid()
  const k_lead  = uuid()
  const k_vill  = uuid()
  const k_mgr_q = uuid()   // 会签节点 key（条件 false 分支用会签）
  const k_mgr   = uuid()
  const k_cc    = uuid()
  const k_end   = uuid()
  const sampleWorkflow = await prisma.approvalWorkflow.upsert({
    where: { id: 1000 },
    update: {},
    create: {
      id: 1000,
      name: '征收补偿协议标准流程（示例）',
      tableId: levyAgreementTable.id,
      description: 'v1.2.2 v2 审批引擎示例：金额>=5万 3级会签；<5万 2级单批；抄送管理员；自动触发 LEVY_SAVE',
      status: WorkflowStatus.ACTIVE,    // v2 发布后即 ACTIVE
      version: 1,
      isDefault: true,
      triggerEvents: { MANUAL_SUBMIT: true, LEVY_SAVE: true, LEVY_SYNC_PASS: false },
      timeoutPolicy: { defaultHours: 48, defaultAction: 'AUTO_PASS', notifyEscalationRoleId: null },
      publishedAt: new Date(),
      publishedBy: admin.id,
      createdBy:   admin.id,
      jsonDefinition: {
        nodes: [
          { id: k_start, type: 'START', prev: [], next: [k_cond] },
          { id: k_cond,  type: 'CONDITION_BRANCH', prev: [k_start], nextTrue: [k_lead], nextFalse: [k_mgr_q],
            expression: [{ field: 'compensation_total', op: 'gte', value: 50000 }] },
          { id: k_lead,  type: 'APPROVER_SINGLE', prev: [k_cond], next: [k_vill],
            approvalMode: 'single', approverKind: 'ROLE', approverCandidates: [managerRole.id] },
          { id: k_vill,  type: 'APPROVER_SINGLE', prev: [k_lead], next: [k_cc],
            approvalMode: 'single', approverKind: 'USER', approverCandidates: [admin.id] },
          { id: k_mgr_q, type: 'APPROVER_COUNTERSIGN', prev: [k_cond], next: [k_mgr],
            approvalMode: 'countersign', approverKind: 'ROLE', approverCandidates: [managerRole.id], countersignQuorum: 100 },
          { id: k_mgr,   type: 'APPROVER_SINGLE', prev: [k_mgr_q], next: [k_cc],
            approvalMode: 'single', approverKind: 'USER', approverCandidates: [admin.id] },
          { id: k_cc,    type: 'CC', prev: [k_vill, k_mgr], next: [k_end], ccTargets: { kind: 'ROLE', ids: [adminRole.id] } },
          { id: k_end,   type: 'END', prev: [k_cc], next: [] },
        ],
        globals: { engine: 'v2', allowTransfer: true, allowAddCountersign: true,
                   onRejectDefault: 'REJECT_INSTANCE', notify: { channel: 'INTERNAL' } }
      },
      canvasData: {
        nodes: [
          { id: k_start, position: { x: 80,  y: 220 }, type: 'input',  data: { label: '开始' } },
          { id: k_cond,  position: { x: 300, y: 220 }, type: 'default',data: { label: '金额>=5万？' } },
          { id: k_lead,  position: { x: 540, y: 80  }, type: 'default',data: { label: '征收组主管单批' } },
          { id: k_vill,  position: { x: 820, y: 80  }, type: 'default',data: { label: '村长单批' } },
          { id: k_mgr_q, position: { x: 540, y: 360 }, type: 'default',data: { label: '征收组会签(全票)' } },
          { id: k_mgr,   position: { x: 820, y: 360 }, type: 'default',data: { label: '管理员单批' } },
          { id: k_cc,    position: { x: 1080,y: 220 }, type: 'default',data: { label: '抄送ADMIN' } },
          { id: k_end,   position: { x: 1300,y: 220 }, type: 'output', data: { label: '结束' } },
        ],
        edges: [
          { id: 'e1', source: k_start, target: k_cond },
          { id: 'e2', source: k_cond,  target: k_lead,  sourceHandle: 'a', label: 'TRUE' },
          { id: 'e3', source: k_cond,  target: k_mgr_q, sourceHandle: 'b', label: 'FALSE' },
          { id: 'e4', source: k_lead,  target: k_vill },
          { id: 'e5', source: k_mgr_q, target: k_mgr },
          { id: 'e6', source: k_vill,  target: k_cc },
          { id: 'e7', source: k_mgr,   target: k_cc },
          { id: 'e8', source: k_cc,    target: k_end },
        ],
        viewport: { zoom: 0.7 }
      },
      nodes: {
        create: [
          { nodeKey: k_start, nodeType: 'START', nodeName: '开始' },
          { nodeKey: k_cond,  nodeType: 'CONDITION_BRANCH', nodeName: '条件：金额>=5万？' },
          { nodeKey: k_lead,  nodeType: 'APPROVER_SINGLE', nodeName: '征收组主管' },
          { nodeKey: k_vill,  nodeType: 'APPROVER_SINGLE', nodeName: '村长' },
          { nodeKey: k_mgr_q, nodeType: 'APPROVER_COUNTERSIGN', nodeName: '征收组会签' },
          { nodeKey: k_mgr,   nodeType: 'APPROVER_SINGLE', nodeName: '管理员终批' },
          { nodeKey: k_cc,    nodeType: 'CC', nodeName: '抄送ADMIN' },
          { nodeKey: k_end,   nodeType: 'END', nodeName: '结束' },
        ]
      }
    }
  })
  // 表级绑定（approvalTriggerConfig）：LEVY_SAVE 自动走这个流程
  try {
    await prisma.dataTable.update({
      where: { id: levyAgreementTable.id },
      data: {
        approvalTriggerConfig: {
          MANUAL_SUBMIT:  { workflowId: sampleWorkflow.id, workflowVersion: 1, enabled: true },
          LEVY_SAVE:      { workflowId: sampleWorkflow.id, workflowVersion: 1, enabled: true },
          LEVY_SYNC_PASS: { workflowId: sampleWorkflow.id, workflowVersion: 1, enabled: false },
        },
        featureFlags: { v2Approval: true, levyModule: true },
      },
    })
  } catch(e) { /* ignore */ }
  console.log(`✅ 示例审批流程创建成功: id=${sampleWorkflow.id}（征收补偿协议 · 双分支+会签+抄送）`)

  console.log('\n🎉 数据库初始化完成！')
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
