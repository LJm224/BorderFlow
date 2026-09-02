import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { ListAuditLogsDto } from './audit.dto';

type AuditClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  record(
    tenantId: string,
    userId: string,
    action: string,
    resource: string,
    resourceId?: string,
    metadata?: Prisma.InputJsonValue,
    client: AuditClient = this.prisma,
  ) {
    return client.auditLog.create({
      data: {
        tenantId,
        userId,
        action,
        resource,
        ...(resourceId ? { resourceId } : {}),
        ...(metadata !== undefined ? { metadata } : {}),
      },
    });
  }

  async list(tenantId: string, query: ListAuditLogsDto) {
    const keyword = query.keyword?.trim();
    const where: Prisma.AuditLogWhereInput = {
      tenantId,
      ...(query.resource ? { resource: query.resource } : {}),
      ...(keyword
        ? {
            OR: [
              { action: { contains: keyword, mode: 'insensitive' } },
              { resourceId: { contains: keyword, mode: 'insensitive' } },
              { user: { name: { contains: keyword, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } };
  }
}
