-- CreateEnum
CREATE TYPE "InventoryAllocationStatus" AS ENUM ('RESERVED', 'FULFILLED', 'RELEASED');

-- Extend inventory movements so each movement can be traced to a warehouse balance and operator.
ALTER TABLE "InventoryTransaction"
    ADD COLUMN "inventoryId" TEXT,
    ADD COLUMN "actorUserId" TEXT,
    ADD COLUMN "beforeAvailable" INTEGER,
    ADD COLUMN "afterAvailable" INTEGER,
    ADD COLUMN "beforeLocked" INTEGER,
    ADD COLUMN "afterLocked" INTEGER;

-- CreateTable
CREATE TABLE "InventoryAllocation" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "InventoryAllocationStatus" NOT NULL DEFAULT 'RESERVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryTransaction_inventoryId_createdAt_idx" ON "InventoryTransaction"("inventoryId", "createdAt");
CREATE INDEX "InventoryAllocation_orderId_status_idx" ON "InventoryAllocation"("orderId", "status");
CREATE INDEX "InventoryAllocation_orderItemId_status_idx" ON "InventoryAllocation"("orderItemId", "status");
CREATE INDEX "InventoryAllocation_inventoryId_status_idx" ON "InventoryAllocation"("inventoryId", "status");

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "Inventory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryAllocation" ADD CONSTRAINT "InventoryAllocation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryAllocation" ADD CONSTRAINT "InventoryAllocation_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryAllocation" ADD CONSTRAINT "InventoryAllocation_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "Inventory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
