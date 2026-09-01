export const USER_ROLES = ['ADMIN', 'OPERATOR', 'WAREHOUSE', 'ANALYST'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const PRODUCT_STATUSES = ['DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'OFFLINE'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const ORDER_STATUSES = [
  'PENDING_PAYMENT',
  'PAID',
  'PICKING',
  'SHIPPED',
  'COMPLETED',
  'CANCELLED',
  'REFUNDED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'CNY'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const INVENTORY_TRANSACTION_TYPES = [
  'SALE',
  'RESTOCK',
  'RESERVATION',
  'RELEASE',
  'ADJUSTMENT',
] as const;
export type InventoryTransactionType = (typeof INVENTORY_TRANSACTION_TYPES)[number];

export const AI_RUN_STATUSES = [
  'IDLE',
  'RUNNING',
  'VALIDATING',
  'WAITING_APPROVAL',
  'SAVING',
  'COMPLETED',
  'FAILED',
] as const;
export type AiRunStatus = (typeof AI_RUN_STATUSES)[number];

export interface ApiMeta {
  requestId: string;
}

export interface ApiSuccess<T> {
  data: T;
  meta: ApiMeta;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: Record<string, unknown>;
  };
}
