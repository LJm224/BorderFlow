# BF-011 权限矩阵

权限由后端根据 JWT 中的角色决定，前端传来的 `role` 或 `permission` 不会被信任。业务接口后续同时使用 `JwtAuthGuard`、`TenantIsolationGuard` 和 `PermissionsGuard`，并在接口上声明 `@RequirePermissions(...)`。

| 角色 | 能做什么 |
| --- | --- |
| `ADMIN` | 全部权限，包括用户管理 |
| `OPERATOR` | 查看/编辑/审核商品，运行 AI，查看订单和看板 |
| `WAREHOUSE` | 查看订单，履约订单，查看/修改库存，看板 |
| `ANALYST` | 查看商品、订单、库存、看板，导出报表 |

当前权限清单：`product:read`、`product:write`、`product:approve`、`ai:run`、`order:read`、`order:fulfill`、`inventory:read`、`inventory:write`、`dashboard:read`、`report:export`、`user:manage`。
