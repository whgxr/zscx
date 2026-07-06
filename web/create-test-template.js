const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const table = await prisma.dataTable.findFirst();
  if (!table) { console.log('No table found'); return; }
  const existing = await prisma.exportTemplate.findFirst({ where: { name: '测试模板' } });
  if (existing) { console.log('Template already exists, id:', existing.id); return; }
  const tpl = await prisma.exportTemplate.create({
    data: {
      name: '测试模板',
      tableId: table.id,
      type: 'STANDARD',
      format: 'EXCEL',
      description: '测试嵌入式编辑器',
      config: {},
      createdBy: 1,
    }
  });
  console.log('Created template id:', tpl.id);
}
main().finally(() => prisma.$disconnect());
