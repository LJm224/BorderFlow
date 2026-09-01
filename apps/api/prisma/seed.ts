import { Currency, PrismaClient, ProductStatus, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { id: 'demo-tenant-001' },
    update: {},
    create: {
      id: 'demo-tenant-001',
      name: 'BorderFlow Demo Store',
      defaultCurrency: Currency.USD,
      defaultTimezone: 'Asia/Shanghai',
    },
  });

  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'admin@borderflow.dev' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Demo Admin',
      email: 'admin@borderflow.dev',
      passwordHash: 'replace-with-bcrypt-hash',
      role: UserRole.ADMIN,
    },
  });

  await prisma.product.upsert({
    where: { id: 'demo-product-001' },
    update: {},
    create: {
      id: 'demo-product-001',
      tenantId: tenant.id,
      name: 'Demo Travel Backpack',
      description: 'A demo product for local development.',
      market: 'US',
      currency: Currency.USD,
      status: ProductStatus.DRAFT,
    },
  });
}

main().finally(() => prisma.$disconnect());
