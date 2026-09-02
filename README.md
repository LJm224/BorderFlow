# BorderFlow

跨境商家运营工作台，技术主线为 React + TypeScript + NestJS + Prisma + PostgreSQL。

## 当前状态（2026-09-02）

已完成工程基础、JWT 登录与刷新会话、tenant 隔离与 RBAC、商品/SKU、店铺与仓库管理、仓库库存档案、库存流水、订单库存分配、订单履约、手工订单、Shopify Mock 订单导入、审计日志和商品详情闭环。订单-库存真实 HTTP E2E 位于 `apps/api/e2e/order-inventory.e2e.mjs`，店铺/手工订单/渠道 E2E 位于 `apps/api/e2e/store-order-channel.e2e.mjs`。

数据看板、AI 商品上架 Agent、真实 Shopify OAuth/Webhook 同步和 CI/部署仍在后续切片中。页面验收步骤见 [`docs/sales-operations-e2e.md`](docs/sales-operations-e2e.md)。

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

点击“订单与履约”即可测试订单搜索、状态筛选、分页、详情和状态时间线；管理员或仓库账号可推进履约状态。

管理员或运营账号可以在“订单与履约”点击“创建手工订单”，选择店铺和 SKU 创建订单；“销售渠道 → Shopify 集成”提供连接、外部 SKU 映射和可重复执行的 Mock 订单导入。

点击“店铺与仓库”可以维护店铺、启停店铺并新增/编辑仓库；库存配置和订单履约会复用对应店铺的仓库数据。

点击“库存管理”即可测试 SKU/商品/仓库搜索、库存预警和库存调整；管理员或仓库账号可入库、出库和盘点调整。进入商品详情后，在 SKU 区域点击“配置库存”可以选择仓库、创建库存档案并录入期初库存；SKU 和库存页面支持双向跳转。

订单进入拣货、发货或取消时会自动联动库存分配、锁定、扣减和释放；多仓库库存会按仓库 ID 顺序拆分分配，并在订单详情展示分配仓库。

管理员或分析员可以打开“审计日志”查看商品、订单和库存关键操作；API 入口为 `GET /api/audit-logs`。

## 校验

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build

# 需要本地 PostgreSQL 和演示数据
pnpm test:e2e
```
