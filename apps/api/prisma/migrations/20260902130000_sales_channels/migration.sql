-- Add order provenance so manually created and imported orders remain distinguishable.
CREATE TYPE "OrderSource" AS ENUM ('MANUAL', 'SHOPIFY');

ALTER TABLE "Order"
    ADD COLUMN "source" "OrderSource" NOT NULL DEFAULT 'MANUAL',
    ADD COLUMN "externalOrderId" TEXT,
    ADD COLUMN "channelConnectionId" TEXT;

CREATE UNIQUE INDEX "Order_channelConnectionId_externalOrderId_key" ON "Order"("channelConnectionId", "externalOrderId");
ALTER TABLE "Order" ADD CONSTRAINT "Order_channelConnectionId_fkey" FOREIGN KEY ("channelConnectionId") REFERENCES "ChannelConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ChannelSkuMapping" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "externalSku" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChannelSkuMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChannelSkuMapping_connectionId_externalSku_key" ON "ChannelSkuMapping"("connectionId", "externalSku");
CREATE UNIQUE INDEX "ChannelSkuMapping_connectionId_skuId_key" ON "ChannelSkuMapping"("connectionId", "skuId");
CREATE INDEX "ChannelSkuMapping_tenantId_externalSku_idx" ON "ChannelSkuMapping"("tenantId", "externalSku");

ALTER TABLE "ChannelSkuMapping" ADD CONSTRAINT "ChannelSkuMapping_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChannelSkuMapping" ADD CONSTRAINT "ChannelSkuMapping_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "ChannelConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChannelSkuMapping" ADD CONSTRAINT "ChannelSkuMapping_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE CASCADE ON UPDATE CASCADE;
