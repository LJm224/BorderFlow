# BorderFlow

跨境商家运营工作台，技术主线为 React + TypeScript + NestJS + Prisma + PostgreSQL。

## 当前状态

项目已完成 Phase 0 工程骨架：Web/API/共享类型目录、健康检查、Swagger 壳、Prisma Schema、Docker Compose 和基础测试已建立。业务模块尚未实现。

## 环境要求

- Node.js 20+（当前开发机已检测到 Node.js 24）
- pnpm 10+
- Docker Desktop（用于 PostgreSQL，项目映射到宿主机 `15432` 端口）

## 启动

```bash
pnpm install
copy .env.example .env
docker compose up -d db
pnpm --filter @borderflow/api prisma:generate
pnpm --filter @borderflow/api prisma:migrate -- --name init
pnpm --filter @borderflow/api prisma:seed
pnpm dev
```

- Web：<http://localhost:5173>
- API：<http://localhost:3001/api/health>
- Swagger：<http://localhost:3001/docs>

## BF-009 演示账号

登录需要填写商户编码、邮箱和密码：

| 商户编码 | 邮箱 | 密码 |
| --- | --- | --- |
| `demo-shop` | `admin@borderflow.dev` | `admin123` |
| `test-shop` | `admin@test.borderflow.dev` | `admin123` |

同一演示商户还提供了三个权限测试账号（密码均为 `admin123`）：`operator@borderflow.dev`（运营）、`warehouse@borderflow.dev`（仓库）、`analyst@borderflow.dev`（分析）。

打开 <http://localhost:5173> 即可进入登录页；商户编码使用 `demo-shop`，登录后可点击右上角“退出登录”。

登录后点击左侧“商品与 SKU”即可测试商品列表、关键词搜索、分页和新建/编辑商品。

## 校验

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
