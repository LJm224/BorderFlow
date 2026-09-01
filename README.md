# BorderFlow

跨境商家运营工作台，技术主线为 React + TypeScript + NestJS + Prisma + PostgreSQL。

## 当前状态

项目已完成 Phase 0 工程骨架：Web/API/共享类型目录、健康检查、Swagger 壳、Prisma Schema、Docker Compose 和基础测试已建立。业务模块尚未实现。

## 环境要求

- Node.js 20+（当前开发机已检测到 Node.js 24）
- pnpm 10+
- Docker Desktop（用于 PostgreSQL）

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

## 校验

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

详细执行顺序见 [BORDERFLOW_VIBE_CODING_EXECUTION_PLAN.md](./BORDERFLOW_VIBE_CODING_EXECUTION_PLAN.md)。
