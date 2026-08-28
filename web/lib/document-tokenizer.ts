/**
 * M3 共享模板 Tokenizer
 *  支持：
 *    纯文本 Token
 *    {{字段名}}              → VALUE
 *    {{字段名|格式化器}}      → VALUE （格式化器：date/dateTime/currencyCN/upper/lower/len/…）
 *    {{#if 条件表达式}} ... {{/if}}            → BLOCK IF
 *    {{#unless 条件}} ... {{/unless}}          → BLOCK IF (negate)
 *    {{#each 数组字段 as item,index}} ... {{/each}} → BLOCK EACH
 *    {{item.xxx}}  在 each 内访问
 *    {{{html富文本字段}}}                        → RICH HTML (不加转义)
 *    {{!注释}}                                  → IGNORED
 *  表达式支持：简单的 field op value 语法；复合的用括号，求值走 evalConditionEngine()
 */
export type TokenKind =
  | 'TEXT'
  | 'VALUE'
  | 'VALUE_RAW'  // 三个花括号：不转义（Word：保留富文本）
  | 'IF_OPEN'
  | 'IF_CLOSE'
  | 'UNLESS_OPEN'
  | 'EACH_OPEN'
  | 'EACH_CLOSE'
  | 'COMMENT'

export interface DocToken {
  kind: TokenKind
  raw: string
  start: number
  // VALUE
  fieldPath?: string
  formatters?: { name: string; args?: any[] }[]  // [ { name:'date', args:['YYYY-MM-DD'] } ]
  // IF / UNLESS
  expression?: string
  // EACH
  eachArrayPath?: string
  eachItemAlias?: string  // 默认 'item'
  eachIndexAlias?: string // 默认 'index'
}

const TOKEN_RE = /(\{\{\{[\s\S]*?\}\}\}|\{\{[\s\S]*?\}\})/g

/**
 * 一级切分：把一串字符串分成 TEXT + 其他 token (未做 IF/EACH 块嵌套)
 */
export function tokenizeFlat(text: string): DocToken[] {
  const tokens: DocToken[] = []
  let last = 0
  let m: RegExpExecArray | null
  TOKEN_RE.lastIndex = 0
  while ((m = TOKEN_RE.exec(text)) !== null) {
    if (m.index > last) tokens.push({ kind: 'TEXT', raw: text.slice(last, m.index), start: last })
    const s = m.index, raw = m[0]
    if (raw.startsWith('{{{')) {
      const body = raw.slice(3, -3).trim()
      tokens.push({ kind: 'VALUE_RAW', raw, start: s, fieldPath: body })
    } else {
      const body = raw.slice(2, -2).trim()
      if (!body) tokens.push({ kind: 'TEXT', raw: '', start: s })
      else if (body.startsWith('!')) tokens.push({ kind: 'COMMENT', raw, start: s })
      else if (body.startsWith('/if')) tokens.push({ kind: 'IF_CLOSE', raw, start: s })
      else if (body.startsWith('/unless')) tokens.push({ kind: 'IF_CLOSE', raw, start: s, expression: '__UNLESS__' })
      else if (body.startsWith('/each')) tokens.push({ kind: 'EACH_CLOSE', raw, start: s })
      else if (body.startsWith('#if')) tokens.push({ kind: 'IF_OPEN', raw, start: s, expression: body.slice(3).trim() })
      else if (body.startsWith('#unless')) tokens.push({ kind: 'UNLESS_OPEN', raw, start: s, expression: body.slice(7).trim() })
      else if (body.startsWith('#each')) {
        const head = body.slice(5).trim()
        // #each orders as o,i
        const mm = /^([\w\.]+)(?:\s+as\s+(\w+)(?:\s*,\s*(\w+))?)?$/.exec(head)
        tokens.push({
          kind: 'EACH_OPEN', raw, start: s,
          eachArrayPath: mm?.[1] ?? head, eachItemAlias: mm?.[2] ?? 'item', eachIndexAlias: mm?.[3] ?? 'index',
        })
      } else {
        // VALUE: field|fmt1(a,b)|fmt2
        const segs = body.split('|').map(s => s.trim())
        const fieldPath = segs[0]
        const fms = segs.slice(1).map(sf => {
          const mfmt = /^(\w+)(?:\((.*)\))?$/.exec(sf)
          if (!mfmt) return { name: sf }
          const args = mfmt[2] !== undefined
            ? mfmt[2].split(',').map(a => {
                a = a.trim()
                if (/^-?\d+(\.\d+)?$/.test(a)) return Number(a)
                if ((a.startsWith('"') && a.endsWith('"')) || (a.startsWith("'") && a.endsWith("'"))) return a.slice(1, -1)
                return a
              })
            : undefined
          return { name: mfmt[1], args }
        })
        tokens.push({ kind: 'VALUE', raw, start: s, fieldPath, formatters: fms.length ? fms : undefined })
      }
    }
    last = m.index + raw.length
  }
  if (last < text.length) tokens.push({ kind: 'TEXT', raw: text.slice(last), start: last })
  return tokens
}

/**
 * 按字段路径取值（支持 a.b.c、each 作用域栈：context array 由外到内 [eachCtx1, eachCtx2, root]）
 */
export function resolveField(fieldPath: string, contexts: any[]): any {
  if (!fieldPath) return ''
  // @index: 0-based 循环索引
  if (fieldPath === '@index') {
    for (let i = contexts.length - 1; i >= 0; i--) {
      if (contexts[i] && contexts[i].__index !== undefined) return contexts[i].__index
    }
    return ''
  }
  // @row: 1-based 循环行号（表格场景常用）
  if (fieldPath === '@row') {
    for (let i = contexts.length - 1; i >= 0; i--) {
      if (contexts[i] && contexts[i].__index !== undefined) return contexts[i].__index + 1
    }
    return ''
  }
  // @first: 是否第一行
  if (fieldPath === '@first') {
    for (let i = contexts.length - 1; i >= 0; i--) {
      if (contexts[i] && contexts[i].__index !== undefined) return contexts[i].__index === 0
    }
    return false
  }
  // @last: 是否最后一行（需要 __arrayLen 支持）
  if (fieldPath === '@last') {
    for (let i = contexts.length - 1; i >= 0; i--) {
      if (contexts[i] && contexts[i].__index !== undefined && contexts[i].__arrayLen !== undefined) {
        return contexts[i].__index === contexts[i].__arrayLen - 1
      }
    }
    return false
  }
  // 父级上下文访问：../field 或 ../../field
  if (fieldPath.startsWith('../')) {
    // 找到最近的 each context，然后从它的上一层开始查找
    let parentCtxStart = contexts.length
    for (let i = contexts.length - 1; i >= 0; i--) {
      if (contexts[i] && contexts[i].__alias !== undefined) {
        parentCtxStart = i // 跳过这个 each frame
        break
      }
    }
    const remaining = fieldPath.slice(3) // 去掉 '../'
    // 递归处理 ../../
    if (remaining.startsWith('../')) {
      return resolveField(remaining, contexts.slice(0, parentCtxStart))
    }
    // 在父级上下文中查找
    return resolveField(remaining, contexts.slice(0, parentCtxStart))
  }
  // 安全属性读取：禁止访问原型链敏感属性（防止 constructor 等原型链注入）
  const DANGEROUS_PROPS = new Set(['constructor', '__proto__', 'prototype'])
  function safeGet(obj: any, key: string): any {
    if (obj == null || DANGEROUS_PROPS.has(key)) return undefined
    return obj[key]
  }
  // alias 优先（如 item.xxx → 在最近的 each ctx 内找别名对应的对象再取 xxx）
  const parts = fieldPath.split('.')
  // 如果第一部分匹配某层 context.__alias，则从该层的对象开始
  for (let i = contexts.length - 1; i >= 0; i--) {
    const c = contexts[i]
    if (c && c.__alias === parts[0]) {
      let v: any = c.__item
      for (let p = 1; p < parts.length; p++) v = safeGet(v, parts[p])
      return v
    }
  }
  // 否则默认从 root/最近层取
  let v: any = contexts[contexts.length - 1]?.root ?? contexts[contexts.length - 1] ?? null
  for (let i = 0; i < parts.length; i++) {
    if (v == null) return undefined
    v = safeGet(v, parts[i])
  }
  return v
}

export function applyFormatters(v: any, fms?: DocToken['formatters']): any {
  if (!fms) return v
  let r = v
  for (const f of fms) {
    switch (f.name) {
      case 'date':
        if (r == null || r === '') { r = ''; break }
        try {
          const d = new Date(r)
          if (isNaN(d.getTime())) { r = String(r); break }
          const fmt = (f.args?.[0] as string) || 'YYYY-MM-DD'
          r = fmt
            .replace(/YYYY/g, String(d.getFullYear()))
            .replace(/MM/g, String(d.getMonth() + 1).padStart(2, '0'))
            .replace(/DD/g, String(d.getDate()).padStart(2, '0'))
            .replace(/HH/g, String(d.getHours()).padStart(2, '0'))
            .replace(/mm/g, String(d.getMinutes()).padStart(2, '0'))
            .replace(/ss/g, String(d.getSeconds()).padStart(2, '0'))
        } catch { r = String(r) }
        break
      case 'dateTime':
        r = applyFormatters(r, [{ name: 'date', args: [(f.args?.[0] as string) || 'YYYY-MM-DD HH:mm'] }])
        break
      case 'upper': r = r == null ? '' : String(r).toUpperCase(); break
      case 'lower': r = r == null ? '' : String(r).toLowerCase(); break
      case 'len': r = r == null ? 0 : String(r).length; break
      case 'num': {
        const digits = f.args?.[0] ?? 2
        r = r == null || r === '' ? '' : Number(r).toFixed(Number(digits))
        break
      }
      case 'currencyCN':
      case 'RMB': r = numberToChineseRMB(r); break
      case 'FORMAT_NUMBER': {
        // 千分位格式化：FORMAT_NUMBER(2) → 1,234.56
        if (r == null || r === '') { r = ''; break }
        const digits = f.args?.[0] ?? 2
        const n = Number(r)
        if (isNaN(n)) { r = String(r); break }
        r = n.toLocaleString('zh-CN', { minimumFractionDigits: Number(digits), maximumFractionDigits: Number(digits) })
        break
      }
      case 'trim': r = r == null ? '' : String(r).trim(); break
      case 'default': r = (r == null || r === '') ? (f.args?.[0] ?? '') : r; break
      default: break
    }
  }
  return r
}

// 人民币大写（简化版）
function numberToChineseRMB(n: any): string {
  if (n === '' || n === null || n === undefined) return ''
  const num = Number(n)
  if (isNaN(num)) return ''
  const fraction = ['角', '分']
  const digit = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖']
  const unit = [['元', '万', '亿'], ['', '拾', '佰', '仟']]
  const sign = num < 0 ? '欠' : ''
  let a = Math.abs(num)
  let s = ''
  for (let i = 0; i < fraction.length; i++) {
    s += (digit[Math.floor(a * 10 * Math.pow(10, i)) % 10] + fraction[i]).replace(/零./, '')
  }
  s = s || '整'
  a = Math.floor(a)
  for (let i = 0; i < unit[0].length && a > 0; i++) {
    let p = ''
    for (let j = 0; j < unit[1].length && a > 0; j++) {
      p = digit[a % 10] + unit[1][j] + p
      a = Math.floor(a / 10)
    }
    s = p.replace(/(零.)*零$/, '').replace(/^$/, '零') + unit[0][i] + s
  }
  return sign + s.replace(/(零.)*零元/, '元').replace(/(零.)+/g, '零').replace(/^整$/, '零元整')
}

// ============================================================================
// 安全表达式求值器（递归下降解析 + AST 求值）
// 支持：==/!=/>/>=/</<=/&&/||/!/括号/字符串/数字/布尔/null/字段引用
// 完全不使用 eval / new Function，杜绝代码注入（CWE-95）
// ============================================================================

type ExprToken =
  | { type: 'op'; value: string }
  | { type: 'num'; value: number }
  | { type: 'str'; value: string }
  | { type: 'ident'; value: string }
  | { type: 'kw'; value: 'true' | 'false' | 'null' | 'undefined' }

/** 表达式词法分析：正确处理字符串字面量，不在字符串内部切分运算符 */
function tokenizeExpr(expr: string): ExprToken[] {
  const tokens: ExprToken[] = []
  let i = 0
  const n = expr.length
  while (i < n) {
    // 跳过空白
    if (/\s/.test(expr[i])) { i++; continue }

    // 字符串字面量（双引号 / 单引号）
    if (expr[i] === '"' || expr[i] === "'") {
      const quote = expr[i]
      i++
      let str = ''
      while (i < n && expr[i] !== quote) {
        if (expr[i] === '\\' && i + 1 < n) { str += expr[i + 1]; i += 2 }
        else { str += expr[i]; i++ }
      }
      i++ // 跳过闭合引号
      tokens.push({ type: 'str', value: str })
      continue
    }

    // 数字（含负数）
    if (/[0-9]/.test(expr[i]) || (expr[i] === '-' && i + 1 < n && /[0-9]/.test(expr[i + 1]))) {
      let num = ''
      if (expr[i] === '-') { num += '-'; i++ }
      while (i < n && /[0-9.]/.test(expr[i])) { num += expr[i]; i++ }
      tokens.push({ type: 'num', value: parseFloat(num) })
      continue
    }

    // 多字符运算符（优先匹配）
    const twoChar = expr.slice(i, i + 2)
    if (['==', '!=', '>=', '<=', '&&', '||'].includes(twoChar)) {
      tokens.push({ type: 'op', value: twoChar })
      i += 2
      continue
    }

    // 单字符运算符
    if (['>', '<', '!', '(', ')'].includes(expr[i])) {
      tokens.push({ type: 'op', value: expr[i] })
      i++
      continue
    }

    // 标识符 / 字段名（支持 a.b.c、@index、../field 等）
    if (/[a-zA-Z_@.\/]/.test(expr[i])) {
      let ident = ''
      while (i < n && /[a-zA-Z0-9_@.\/]/.test(expr[i])) { ident += expr[i]; i++ }
      if (ident === 'true' || ident === 'false' || ident === 'null' || ident === 'undefined') {
        tokens.push({ type: 'kw', value: ident })
      } else {
        tokens.push({ type: 'ident', value: ident })
      }
      continue
    }

    // 未知字符跳过（容错，不抛异常）
    i++
  }
  return tokens
}

type ExprNode =
  | { type: 'literal'; value: any }
  | { type: 'field'; name: string }
  | { type: 'unary'; op: '!'; operand: ExprNode }
  | { type: 'binary'; op: string; left: ExprNode; right: ExprNode }

/** 递归下降语法分析器：or → and → not → comparison → primary */
class ExprParser {
  private tokens: ExprToken[]
  private pos = 0

  constructor(tokens: ExprToken[]) { this.tokens = tokens }

  private peek(): ExprToken | undefined { return this.tokens[this.pos] }
  private consume(): ExprToken | undefined { return this.tokens[this.pos++] }

  private expectOp(op: string): boolean {
    const t = this.peek()
    if (t && t.type === 'op' && t.value === op) { this.pos++; return true }
    return false
  }

  parse(): ExprNode { return this.parseOr() }

  private parseOr(): ExprNode {
    let left = this.parseAnd()
    while (this.expectOp('||')) {
      left = { type: 'binary', op: '||', left, right: this.parseAnd() }
    }
    return left
  }

  private parseAnd(): ExprNode {
    let left = this.parseNot()
    while (this.expectOp('&&')) {
      left = { type: 'binary', op: '&&', left, right: this.parseNot() }
    }
    return left
  }

  private parseNot(): ExprNode {
    if (this.expectOp('!')) {
      return { type: 'unary', op: '!', operand: this.parseNot() }
    }
    return this.parseComparison()
  }

  private parseComparison(): ExprNode {
    const left = this.parsePrimary()
    const t = this.peek()
    if (t && t.type === 'op' && ['==', '!=', '>', '>=', '<', '<='].includes(t.value)) {
      this.pos++
      return { type: 'binary', op: t.value, left, right: this.parsePrimary() }
    }
    return left
  }

  private parsePrimary(): ExprNode {
    const t = this.consume()
    if (!t) return { type: 'literal', value: false }

    // 括号
    if (t.type === 'op' && t.value === '(') {
      const expr = this.parseOr()
      this.expectOp(')')
      return expr
    }

    if (t.type === 'num') return { type: 'literal', value: t.value }
    if (t.type === 'str') return { type: 'literal', value: t.value }
    if (t.type === 'kw') {
      switch (t.value) {
        case 'true': return { type: 'literal', value: true }
        case 'false': return { type: 'literal', value: false }
        case 'null': return { type: 'literal', value: null }
        case 'undefined': return { type: 'literal', value: undefined }
      }
    }
    if (t.type === 'ident') return { type: 'field', name: t.value }

    return { type: 'literal', value: false }
  }
}

/** AST 安全求值：遍历语法树，字段引用通过 resolveField 解析 */
function evalExprNode(node: ExprNode, contexts: any[]): any {
  switch (node.type) {
    case 'literal':
      return node.value
    case 'field':
      return resolveField(node.name, contexts)
    case 'unary':
      if (node.op === '!') return !evalExprNode(node.operand, contexts)
      return false
    case 'binary': {
      const l = evalExprNode(node.left, contexts)
      const r = evalExprNode(node.right, contexts)
      switch (node.op) {
        case '||': return l || r
        case '&&': return l && r
        case '==': return l == r
        case '!=': return l != r
        case '>': return l > r
        case '>=': return l >= r
        case '<': return l < r
        case '<=': return l <= r
        default: return false
      }
    }
  }
}

/** 对外入口：安全布尔表达式求值（无 eval / new Function） */
export function evalBoolExpression(expr: string, contexts: any[]): boolean {
  try {
    const tokens = tokenizeExpr(expr)
    const ast = new ExprParser(tokens).parse()
    return Boolean(evalExprNode(ast, contexts))
  } catch {
    return false
  }
}

export type FlatBlock =
  | { type: 'text'; tokens: DocToken[]; style?: any }
  | { type: 'if'; condition: string; then: FlatBlock[]; else?: FlatBlock[] }
  | { type: 'each'; arrayPath: string; itemAlias: string; indexAlias: string; body: FlatBlock[] }

/**
 * 把平坦 token[] 加上块嵌套处理（消耗 stack 生成 AST）
 */
export function nestTokens(tokens: DocToken[]): FlatBlock[] {
  type Frame = { block: FlatBlock[]; kind: 'root' | 'if' | 'else' | 'each'; condition?: string; arrayPath?: string; itemAlias?: string; indexAlias?: string }
  const stack: Frame[] = [{ block: [], kind: 'root' }]
  let i = 0
  const current = () => stack[stack.length - 1]
  while (i < tokens.length) {
    const t = tokens[i++]
    const txt = (tok: DocToken): FlatBlock => ({ type: 'text', tokens: [tok] })
    if (t.kind === 'TEXT' && t.raw === '') continue
    switch (t.kind) {
      case 'TEXT':
      case 'VALUE':
      case 'VALUE_RAW':
      case 'COMMENT':
        current().block.push(txt(t))
        break
      case 'IF_OPEN':
      case 'UNLESS_OPEN': {
        stack.push({ block: [], kind: 'if', condition: t.kind === 'UNLESS_OPEN' ? `!(${t.expression ?? 'true'})` : (t.expression ?? 'true') })
        break
      }
      case 'IF_CLOSE': {
        // 如果上一个 frame 是 else，关闭 else，再关闭 if
        if (current().kind === 'else') {
          const elseFr = stack.pop()!
          const ifFr = stack.pop()!
          const blk: FlatBlock = { type: 'if', condition: ifFr.condition!, then: ifFr.block, else: elseFr.block }
          current().block.push(blk)
        } else {
          const ifFr = stack.pop()!
          current().block.push({ type: 'if', condition: ifFr.condition!, then: ifFr.block })
        }
        break
      }
      case 'EACH_OPEN': {
        stack.push({ block: [], kind: 'each', arrayPath: t.eachArrayPath!, itemAlias: t.eachItemAlias!, indexAlias: t.eachIndexAlias! })
        break
      }
      case 'EACH_CLOSE': {
        const fr = stack.pop()!
        current().block.push({ type: 'each', arrayPath: fr.arrayPath!, itemAlias: fr.itemAlias!, indexAlias: fr.indexAlias!, body: fr.block })
        break
      }
    }
  }
  // {{else}} 支持：如果 block 内有仅含 "{{else}}" 字符串的 text token，则在 IF frame 内做 split。简单处理：遍历最末 IF frame 检测 text token raw.trim()==='{{else}}'。
  // 这里简化：直接把 TEXT 包含 '{{else}}' 当作分隔（需要在 tokenizer 之前识别出 {{else}}，它不是 token；故在此作为二次扫描）。
  // 为简单起见不实现 else，用户可用两个互斥 IF。如需 else 可以扩展 tokenizer。
  return stack[0].block
}
