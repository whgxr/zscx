// v1.2.2+ 征收模块 - 可填写阶段（editScope）辅助函数
// 纯浏览器/服务端通用工具，无任何服务端依赖（prisma / redis 等），
// 供客户端组件安全导入，避免引入 ioredis 等 Node 内置模块导致客户端构建失败。

// 根据 TableCategory.module 判断当前表所属业务模块
export function moduleOfTable(categoryModule: string | null | undefined): 'survey' | 'levy' | 'both' {
  if (categoryModule === 'SURVEY') return 'survey'
  if (categoryModule === 'LEVY') return 'levy'
  return 'both'
}

// 该字段是否允许在指定模块中填写（editScope 限制）
export function isFieldEditableInModule(
  editScope: string | null | undefined,
  module: 'survey' | 'levy' | 'both'
): boolean {
  const scope = (editScope as string) || 'ALWAYS'
  if (module === 'both') return true
  if (module === 'survey') {
    return scope === 'ALWAYS' || scope === 'SURVEY_ONLY' || scope === 'SURVEY_OR_LEVY'
  }
  // module === 'levy'
  return scope === 'ALWAYS' || scope === 'LEVY_ONLY' || scope === 'SURVEY_OR_LEVY'
}

// 过滤掉当前模块不允许填写的字段值（忽略提交值，保持原值不受影响）
export function stripNonEditableFields(
  fields: Array<{ name: string; editScope: string | null }>,
  data: Record<string, any> | null | undefined,
  module: 'survey' | 'levy' | 'both'
): Record<string, any> {
  if (!data || typeof data !== 'object') return data || {}
  const fieldMap = new Map(fields.map(f => [f.name, f]))
  const out: Record<string, any> = {}
  for (const [key, value] of Object.entries(data)) {
    const field = fieldMap.get(key)
    if (!field) continue
    if (!isFieldEditableInModule(field.editScope, module)) continue // 忽略该字段提交值
    out[key] = value
  }
  return out
}