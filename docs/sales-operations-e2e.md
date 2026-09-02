# 店铺、订单与 Shopify Mock 验收路径

## 页面验收

1. 登录 `demo-shop` / `admin@borderflow.dev` / `admin123`。
2. 进入「店铺与仓库」：确认 `US Demo Store` 和 `US East Warehouse`，可新建店铺及仓库；创建和编辑后刷新页面仍保持数据。
3. 进入「商品与 SKU」→ Demo Travel Backpack →「配置库存」：确认 SKU `BF-BAG-BLACK` 绑定仓库，并能看到可用/锁定数量。
4. 进入「销售渠道」→ Shopify 集成：确认连接状态为已连接，确认 `BF-BAG-BLACK` 已映射；点击「填入 Demo JSON」后执行 Mock 同步，结果应显示成功 1、失败 0。
5. 回到「订单与履约」：找到新导入的订单，来源为 Shopify；也可以点击「创建手工订单」，选择店铺、收货国家和 SKU，创建一笔已付款订单。
6. 打开订单详情，依次推进「拣货中」→「已发货」→「已完成」。进入「库存管理」确认可用库存扣减、锁定库存先增加后释放；取消拣货中的订单应恢复可用库存。
7. 进入「审计日志」：按订单号或订单 ID 搜索，应看到 `ORDER_CREATED`、`ORDER_IMPORTED`、`ORDER_STATUS_CHANGED`，以及对应的库存调整/预留/发货流水。

## Shopify Mock JSON

在「销售渠道 → Shopify 集成」的文本框中提交以下结构。`externalSku` 必须先在当前连接中完成 SKU 映射。

```json
{
  "orders": [
    {
      "externalOrderId": "MOCK-10001",
      "orderNo": "BF-MOCK-10001",
      "market": "US",
      "currency": "USD",
      "shippingCountry": "US",
      "financialStatus": "paid",
      "items": [{ "externalSku": "BF-BAG-BLACK", "quantity": 1 }]
    }
  ]
}
```

再次提交同一个 `externalOrderId` 不会重复建单，同步结果会记录 `DUPLICATE_ORDER`；使用未映射 SKU 会记录 `UNMAPPED_SKU` 并跳过该订单。

## API 验收入口

- `GET/POST/PATCH /api/stores`：店铺查询与维护。
- `GET/POST/PATCH /api/warehouses`：仓库查询与维护，接口会校验店铺租户归属。
- `POST /api/orders`：手工创建订单，服务端按 SKU 价格计算金额并写入 `ORDER_CREATED` 审计。
- `GET /api/channel-connections`：查看渠道连接、SKU 映射和最近同步记录。
- `POST /api/channel-connections/:id/sku-mappings`：维护外部 SKU 映射。
- `POST /api/channel-connections/:id/mock/import-orders`：导入 Shopify Mock 订单，按外部订单号幂等。

完整自动化验证：

```bash
pnpm --filter @borderflow/api test:e2e
pnpm lint
pnpm typecheck
pnpm --filter @borderflow/web test
pnpm --filter @borderflow/web build
```
