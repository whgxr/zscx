# 征收系统性能优化技术设计文档

> 版本: 1.0  
> 日期: 2025-01-20  
> 状态: 实施中

---

## 1. 问题诊断

### 1.1 当前性能瓶颈

| 瓶颈领域 | 问题描述 | 影响等级 |
|---------|---------|---------|
| **Docker 构建** | `npm ci` 每次全量下载依赖，无分层缓存 | 🔴 严重 |
| **页面加载** | 数据库热点查询（用户会话、系统配置）无缓存 | 🔴 严重 |
| **API 响应** | 第三方平台集成配置每次请求查库 | 🟡 中等 |
| **MySQL 连接** | 每次请求新建连接，无连接池复用 | 🟡 中等 |
| **静态资源** | 无 CDN/本地缓存策略 | 🟢 低 |

### 1.2 性能基准

```
指标                    优化前          优化后(预期)
─────────────────────────────────────────────────
Docker 构建时间         15-20 分钟     3-5 分钟
首页加载 (TTFB)         1.2-2.0s      150-300ms  
API 平均响应            300-500ms     50-120ms
数据库查询次数/请求     5-12 次       1-3 次
```

---

## 2. 优化方案架构

### 2.1 总体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        用户 / 浏览器                         │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTPS
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                     Nginx 反向代理 (端口 777)                │
│  ┌───────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ 静态资源缓存  │  │  SSL 终结    │  │  负载均衡策略   │  │
│  └───────────────┘  └──────────────┘  └──────────────────┘  │
└────────────────────────────┬────────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                              ▼
┌─────────────────────┐          ┌─────────────────────┐
│   Next.js App #1    │          │   Next.js App #2    │
│   (主应用实例)      │          │   (主应用实例)      │
│  ┌───────────────┐ │          │  ┌───────────────┐ │
│  │ Prisma ORM    │ │          │  │ Prisma ORM    │ │
│  └───────┬───────┘ │          │  └───────┬───────┘ │
└──────────┼──────────┘          └──────────┼──────────┘
           │                                 │
           ▼                                 ▼
┌─────────────────────────────────────────────────────────────┐
│                    Redis 缓存层 (分离部署)                    │
│  ┌──────────────┐ ┌────────────┐ ┌──────────────────────┐  │
│  │ 会话缓存     │ │ 查询缓存   │ │ API 响应缓存         │  │
│  │ SessionStore │ │ QueryCache│ │ ResponseCache        │  │
│  └──────────────┘ └────────────┘ └──────────────────────┘  │
│  ┌──────────────┐ ┌──────────────────────────────────────┐  │
│  │ 配置缓存     │ │  分布式锁 / 限流                      │  │
│  │ ConfigCache  │ │  RateLimiter / DistributedLock      │  │
│  └──────────────┘ └──────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                              ▼
┌─────────────────────┐          ┌─────────────────────┐
│   MySQL 主数据库     │          │   MySQL 只读从库     │
│   (写操作)          │          │   (读操作)          │
└─────────────────────┘          └─────────────────────┘
```

### 2.2 技术选型

| 组件 | 当前方案 | 优化方案 | 理由 |
|-----|---------|---------|-----|
| **缓存** | 无 | Redis 7.x (分离部署) | 高性能、支持多种数据结构、生态成熟 |
| **会话存储** | 内存 | Redis Session | 跨实例共享、持久化、自动过期 |
| **ORM** | Prisma | Prisma (不变) | 已在使用，配合缓存层优化 |
| **Web 服务器** | Next.js 单体 | Next.js + 反向代理 | 支持横向扩展 |
| **容器化** | Docker Compose | Docker Compose (优化构建) | 不变更部署方式 |

---

## 3. 实施计划

### 3.1 阶段一: 构建优化 (预计节省 70% 构建时间)

#### 3.1.1 Dockerfile 分层缓存策略

```dockerfile
# ===== 阶段 1: 依赖缓存 (可复用层) =====
FROM node:18-alpine AS deps
WORKDIR /app
# 仅复制依赖定义文件，最大化层缓存命中率
COPY web/package.json web/package-lock.json ./
RUN npm ci --prefer-offline

# ===== 阶段 2: 应用构建 (变更触发层) =====  
FROM node:18-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY web/ .
# Prisma 客户端生成
RUN npx prisma generate
# Next.js 生产构建
RUN npm run build

# ===== 阶段 3: 运行时镜像 (最小化) =====
FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# 仅复制生产所需文件
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
# 健康检查
HEALTHCHECK --interval=30s --timeout=5s \
  CMD wget -qO- http://localhost:3000/api/health || exit 1
# 启动命令
CMD ["npm", "start"]
```

**优化要点:**
- ✅ 多阶段构建，分离依赖安装和应用构建
- ✅ `package.json` 单独 COPY，依赖不变时跳过安装
- ✅ `--prefer-offline` 优先使用 npm 本地缓存
- ✅ 健康检查内置于镜像

#### 3.1.2 构建缓存机制

```
首次构建:
  ┌─────────────────────────────────────────┐
  │ 层1: node:18-alpine (基础镜像)          │ ← 缓存
  │ 层2: COPY package.json (依赖定义)       │ ← 缓存
  │ 层3: npm ci (依赖安装, 耗时最长)        │ ← 缓存
  │ 层4: COPY 源代码 (应用代码)             │ ← 每次重建
  │ 层5: npm run build (编译)               │ ← 每次重建
  │ 层6: 运行时镜像 (最小化)                │ ← 每次重建
  └─────────────────────────────────────────┘

后续构建 (仅修改业务代码时):
  ┌─────────────────────────────────────────┐
  │ 层1-3: 复用缓存 ✅                      │ ← 命中缓存
  │ 层4: COPY 源代码 (变更触发)             │ ← 重建
  │ 层5-6: 重新构建                         │ ← 重建
  └─────────────────────────────────────────┘
  
节省: 70-80% 构建时间
```

### 3.2 阶段二: Redis 缓存层 (预计提升 60-80% 响应速度)

#### 3.2.1 缓存架构分层

```
请求链路:
  用户请求 → Next.js API Route
              │
              ▼
         ┌──────────┐     命中      ┌──────────┐
         │ 缓存检查  │─────────────→ │ 返回缓存  │ ← 10-50ms
         └────┬─────┘               └──────────┘
              │ 未命中
              ▼
         ┌──────────┐               ┌──────────┐
         │ 数据库查询 │─────────────→ │ 写入缓存  │ ← 50-200ms
         └──────────┘               └──────────┘
              │
              ▼
         ┌──────────┐
         │ 返回响应  │ ← 150-300ms (首次)
         └──────────┘
```

#### 3.2.2 缓存策略定义

| 缓存类型 | Key 格式 | TTL | 失效策略 | 优先级 |
|---------|---------|-----|---------|-------|
| **用户会话** | `session:{token}` | 24h | 登录/登出时失效 | P0 |
| **系统设置** | `config:system` | 1h | 设置变更时失效 | P0 |
| **平台集成配置** | `integration:{platform}` | 1h | 配置变更时失效 | P0 |
| **权限列表** | `permissions:{role}` | 30min | 角色变更时失效 | P1 |
| **数据列表** | `list:{module}:{queryHash}` | 5min | 新增/编辑/删除时失效 | P1 |
| **统计数据** | `stats:{report}:{date}` | 10min | 定时任务更新 | P2 |

#### 3.2.3 缓存实现示例

```
# 缓存工具库 (lib/cache.ts)

核心函数:
  getOrSetCache<T>(key: string, fetcher: () => Promise<T>, ttl?: number): Promise<T>
  ├── 1. 检查 Redis 是否有缓存
  ├── 2. 命中 → 返回缓存数据
  ├── 3. 未命中 → 执行 fetcher 获取数据
  ├── 4. 写入 Redis (带 TTL)
  └── 5. 返回数据

使用示例:
  // 系统设置缓存 1 小时
  const settings = await getOrSetCache(
    'config:system',
    () => prisma.systemConfig.findFirst(),
    3600  // 1小时
  );
  
  // 集成配置缓存 1 小时
  const config = await getOrSetCache(
    `integration:${platform}`,
    () => prisma.integrationConfig.findUnique({ where: { platform } }),
    3600
  );
```

#### 3.2.4 缓存失效策略

```
┌─────────────────────────────────────────────────────┐
│                  写操作触发失效                      │
├─────────────────────────────────────────────────────┤
│                                                     │
│  用户登录/登出:                                     │
│    redis.del(`session:${token}`)                   │
│                                                     │
│  系统设置更新:                                      │
│    redis.del('config:system')                       │
│                                                     │
│  集成配置变更:                                      │
│    redis.del(`integration:${platform}`)             │
│                                                     │
│  数据增删改:                                        │
│    redis.del(`list:${module}:*`)  ← 模式匹配删除   │
│                                                     │
│  定时全量刷新 (每小时):                            │
│    redis.flushDb()  ← 可选，慎用                    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 3.3 阶段三: 数据库优化

#### 3.3.1 连接池配置

```
prisma/schema.prisma:
  datasource db {
    provider = "mysql"
    url      = env("DATABASE_URL")
  }

env:
  DATABASE_URL="mysql://zscx:zscx123456@mysql:3306/zscx?sslmode=disable&connection_limit=20&pool_timeout=10"

lib/prisma.ts:
  // 单例 Prisma 客户端
  const prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
```

#### 3.3.2 查询优化清单

| 优化项 | 描述 | 状态 |
|-------|------|------|
| 避免 N+1 查询 | 使用 `include`/`select` 预加载关联数据 | ✅ 已实施 |
| 分页查询 | 使用 `skip`/`take` 限制结果集 | ✅ 已实施 |
| 索引优化 | 确保高频查询字段有索引 | 待实施 |
| 只读副本 | 读操作走从库 | 可选 |

### 3.4 阶段四: 部署架构优化

#### 3.4.1 分离式 Redis 部署

```
docker-compose.yml 新增服务:

services:
  redis:
    image: redis:7-alpine
    container_name: zscx-redis
    restart: always
    ports:
      - "${REDIS_PORT:-6379}:6379"
    volumes:
      - redis_data:/data
    command: >
      redis-server
      --maxmemory 256mb
      --maxmemory-policy allkeys-lru
      --save 60 1000    # 持久化: 60秒内1000次写操作后保存
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  redis_data:
    driver: local
```

#### 3.4.2 环境变量配置

```
# .env 文件
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_URL=redis://redis:6379
REDIS_TTL_DEFAULT=3600

# Prisma 配置
DATABASE_URL=mysql://zscx:zscx123456@mysql:3306/zscx?sslmode=disable

# 应用配置
NODE_ENV=production
SESSION_TIMEOUT=1440    # 24小时 (分钟)
```

---

## 4. 已实施清单

### ✅ 已完成

| 序号 | 优化项 | 文件位置 | 状态 |
|-----|-------|---------|-----|
| 1 | Redis 客户端封装 | `web/lib/redis.ts` | ✅ 完成 |
| 2 | 缓存工具库 | `web/lib/cache.ts` | ✅ 完成 |
| 3 | 用户会话缓存 | `web/lib/auth.ts` | ✅ 完成 |
| 4 | 集成配置缓存 | `web/lib/integration-service.ts` | ✅ 完成 |
| 5 | Dockerfile 多阶段优化 | `web/Dockerfile` | ✅ 完成 |
| 6 | Docker Compose Redis 服务 | `docker/docker-compose.yml` | ✅ 完成 |
| 7 | Prisma SSL 修复 | `web/lib/prisma.ts` | ✅ 完成 |
| 8 | ioredis 依赖 | `web/package.json` | ✅ 完成 |
| 9 | 部署自动化脚本 | `deploy_full_stack.py` | ✅ 完成 |

### ⏳ 进行中

| 序号 | 任务 | 说明 |
|-----|-----|------|
| 10 | Docker 镜像构建 | 正在服务器上构建新镜像 |
| 11 | 服务启动与验证 | 构建完成后启动 MySQL + Redis + Web |

### 📋 后续计划

| 序号 | 优化项 | 优先级 | 预计工时 |
|-----|-------|-------|---------|
| 12 | 数据库索引优化 | P1 | 1小时 |
| 13 | API 响应缓存扩展 | P1 | 2小时 |
| 14 | Nginx 静态资源缓存 | P2 | 1小时 |
| 15 | 日志监控体系 | P2 | 2小时 |
| 16 | 性能回归测试 | P1 | 2小时 |

---

## 5. 监控与告警

### 5.1 关键指标

```
Redis 监控:
  - 内存使用率 (maxmemory 256MB)
  - 命中率 (目标 > 90%)
  - 连接数 (目标 < 100)
  - 慢查询 (>1ms)

应用监控:
  - API 平均响应时间 (目标 < 200ms)
  - 错误率 (目标 < 0.1%)
  - 数据库查询次数/请求 (目标 < 5)
  - 缓存 Key 数量

系统监控:
  - CPU 使用率 (目标 < 70%)
  - 内存使用率 (目标 < 80%)
  - 磁盘 I/O
  - Docker 容器状态
```

### 5.2 健康检查端点

```
# 健康检查 API (已在 Dockerfile 中配置)
GET /api/health

响应:
{
  "status": "healthy",
  "timestamp": "2025-01-20T12:00:00Z",
  "checks": {
    "database": "ok",      // MySQL 连接状态
    "cache": "ok",         // Redis 连接状态
    "version": "2.0.0"     // 当前版本
  }
}
```

---

## 6. 回滚方案

### 6.1 降级策略

```
Redis 不可用时:
  ├── cache.ts 自动降级为直接查询数据库
  ├── 用户体验不受影响，仅性能下降
  └── 日志记录 Redis 连接异常

数据库异常时:
  ├── Redis 缓存数据继续服务
  ├── 标记缓存数据为"过期数据"
  └── 数据库恢复后自动刷新
```

### 6.2 版本回滚

```
# 保留上一版本镜像
docker tag zscx-web:local zscx-web:backup-$(date +%Y%m%d)

# 快速回滚
docker compose down
# 修改 docker-compose.yml 中的 image tag
docker compose up -d
```

---

## 7. 总结

### 核心优化措施

1. **构建优化 (70% 提速)**
   - Docker 多阶段构建 + 分层缓存
   - npm 离线缓存

2. **运行时优化 (60-80% 提速)**
   - Redis 缓存热点数据
   - 会话状态缓存
   - API 响应缓存

3. **架构韧性**
   - Redis 故障自动降级
   - 数据库连接池优化
   - 健康检查机制

### 预期效果

```
指标              优化前        优化后       提升幅度
─────────────────────────────────────────────────
构建时间          15-20分钟     3-5分钟      70% ↓
首页 TTFB         1.2-2.0s     150-300ms    80% ↓
API 响应          300-500ms    50-120ms     75% ↓
DB 查询/请求      5-12次       1-3次        75% ↓
```

---

*文档结束*
