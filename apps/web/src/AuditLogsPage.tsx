import { Input, Table, Tag, Typography } from 'antd';
import type { TablePaginationConfig } from 'antd';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { ApiSuccess } from '@borderflow/shared';

interface AuditItem { id: string; action: string; resource: string; resourceId?: string | null; metadata?: Record<string, unknown> | null; createdAt: string; user: { name: string; email: string; role: string } }
interface AuditList { items: AuditItem[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }

export default function AuditLogsPage() {
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const logs = useQuery({
    queryKey: ['audit-logs', keyword, page],
    queryFn: async () => (await api.get<ApiSuccess<AuditList>>('/audit-logs', { params: { keyword: keyword || undefined, page, pageSize: 20 } })).data.data,
  });
  const pagination: TablePaginationConfig = { current: logs.data?.pagination.page ?? page, pageSize: 20, total: logs.data?.pagination.total ?? 0, showSizeChanger: false, onChange: setPage };
  return <div className="products-page">
    <div className="page-heading"><div><Typography.Title level={2}>审计日志</Typography.Title><Typography.Text type="secondary">记录商品、订单和库存的关键操作</Typography.Text></div></div>
    <div className="product-toolbar"><Input.Search allowClear placeholder="搜索操作、资源 ID 或操作者" value={keyword} onChange={(event) => { setKeyword(event.target.value); setPage(1); }} style={{ width: 360 }} /></div>
    <Table rowKey="id" loading={logs.isLoading} dataSource={logs.data?.items ?? []} pagination={pagination} columns={[
      { title: '时间', dataIndex: 'createdAt', render: (value: string) => new Date(value).toLocaleString() },
      { title: '操作者', render: (_: unknown, item: AuditItem) => <div><Typography.Text strong>{item.user.name}</Typography.Text><div className="muted">{item.user.email}</div></div> },
      { title: '操作', dataIndex: 'action', render: (value: string) => <Tag color="blue">{value}</Tag> },
      { title: '资源', render: (_: unknown, item: AuditItem) => `${item.resource}${item.resourceId ? ` / ${item.resourceId}` : ''}` },
      { title: '详情', dataIndex: 'metadata', render: (value: Record<string, unknown> | null | undefined) => value ? <Typography.Text code>{JSON.stringify(value)}</Typography.Text> : <Typography.Text type="secondary">—</Typography.Text> },
    ]} />
  </div>;
}
