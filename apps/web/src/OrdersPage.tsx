import { Button, Descriptions, Drawer, Input, message, Select, Space, Table, Tag, Timeline, Typography } from 'antd';
import type { TablePaginationConfig } from 'antd';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { useAuthStore } from './auth';
import { ApiSuccess } from '@borderflow/shared';

type OrderStatus = 'PENDING_PAYMENT' | 'PAID' | 'PICKING' | 'SHIPPED' | 'COMPLETED' | 'CANCELLED' | 'REFUNDED';
interface OrderItem { id: string; quantity: number; unitPrice: string | number; sku: { skuCode: string; variantName: string; product?: { id: string; name: string } } }
interface Order { id: string; orderNo: string; market: string; currency: string; totalAmount: string | number; status: OrderStatus; shippingCountry: string; createdAt: string; store: { name: string; channelType: string }; items: OrderItem[]; timelineEvents?: { id: string; fromStatus: OrderStatus | null; toStatus: OrderStatus | null; eventType: string; note?: string; createdAt: string }[] }
interface OrderList { items: Order[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }

const labels: Record<OrderStatus, string> = { PENDING_PAYMENT: '待付款', PAID: '已付款', PICKING: '拣货中', SHIPPED: '已发货', COMPLETED: '已完成', CANCELLED: '已取消', REFUNDED: '已退款' };
const statusColor: Record<OrderStatus, string> = { PENDING_PAYMENT: 'default', PAID: 'blue', PICKING: 'processing', SHIPPED: 'cyan', COMPLETED: 'green', CANCELLED: 'red', REFUNDED: 'orange' };

export default function OrdersPage() {
  const user = useAuthStore((state) => state.user);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<OrderStatus | undefined>();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Order | null>(null);
  const queryClient = useQueryClient();
  const canFulfill = user?.role === 'ADMIN' || user?.role === 'WAREHOUSE';
  const orders = useQuery({
    queryKey: ['orders', keyword, status, page],
    queryFn: async () => (await api.get<ApiSuccess<OrderList>>('/orders', { params: { keyword: keyword || undefined, status, page, pageSize: 10 } })).data.data,
  });
  const changeStatus = useMutation({
    mutationFn: ({ id, nextStatus }: { id: string; nextStatus: OrderStatus }) => api.patch(`/orders/${id}/status`, { status: nextStatus }),
    onSuccess: () => { message.success('订单状态已更新'); queryClient.invalidateQueries({ queryKey: ['orders'] }); setSelected(null); },
    onError: () => message.error('状态流转不合法或没有权限'),
  });
  const pagination: TablePaginationConfig = { current: orders.data?.pagination.page ?? page, pageSize: 10, total: orders.data?.pagination.total ?? 0, showSizeChanger: false, onChange: (nextPage) => setPage(nextPage) };

  return <div className="products-page">
    <div className="page-heading"><div><Typography.Title level={2}>订单与履约</Typography.Title><Typography.Text type="secondary">查看订单并处理发货流程</Typography.Text></div></div>
    <Space wrap className="product-toolbar"><Input.Search allowClear placeholder="搜索订单号或收货国家" value={keyword} onChange={(event) => { setKeyword(event.target.value); setPage(1); }} style={{ width: 300 }} /><Select allowClear placeholder="全部状态" value={status} onChange={(value) => { setStatus(value); setPage(1); }} options={Object.entries(labels).map(([value, label]) => ({ value, label }))} style={{ width: 150 }} /></Space>
    <Table rowKey="id" loading={orders.isLoading} dataSource={orders.data?.items ?? []} pagination={pagination} columns={[
      { title: '订单号', dataIndex: 'orderNo', render: (value: string, order: Order) => <Button type="link" onClick={() => setSelected(order)}>{value}</Button> },
      { title: '店铺', dataIndex: ['store', 'name'] },
      { title: '金额', render: (_: unknown, order: Order) => `${order.totalAmount} ${order.currency}` },
      { title: '商品数', render: (_: unknown, order: Order) => order.items.reduce((sum, item) => sum + item.quantity, 0) },
      { title: '状态', dataIndex: 'status', render: (value: OrderStatus) => <Tag color={statusColor[value]}>{labels[value]}</Tag> },
      { title: '操作', render: (_: unknown, order: Order) => <Button type="link" onClick={() => setSelected(order)}>查看详情</Button> },
    ]} />
    <Drawer className="order-drawer" title={selected ? `订单 ${selected.orderNo}` : '订单详情'} open={!!selected} onClose={() => setSelected(null)} width={560}>
      {selected && <><Descriptions column={1} size="small" items={[{ key: 'store', label: '店铺', children: selected.store.name }, { key: 'country', label: '收货国家', children: selected.shippingCountry }, { key: 'amount', label: '订单金额', children: `${selected.totalAmount} ${selected.currency}` }, { key: 'status', label: '状态', children: <Tag color={statusColor[selected.status]}>{labels[selected.status]}</Tag> }]} />
        <Typography.Title level={5}>订单商品</Typography.Title>
        <Table size="small" rowKey="id" pagination={false} dataSource={selected.items} columns={[{ title: 'SKU', dataIndex: ['sku', 'skuCode'] }, { title: '变体', dataIndex: ['sku', 'variantName'] }, { title: '数量', dataIndex: 'quantity' }, { title: '单价', dataIndex: 'unitPrice' }]} />
        {canFulfill && <Select className="order-status-control" value={selected.status} options={Object.entries(labels).map(([value, label]) => ({ value, label }))} onChange={(nextStatus: OrderStatus) => changeStatus.mutate({ id: selected.id, nextStatus })} />}
        <Typography.Title level={5}>状态时间线</Typography.Title>
        <Timeline items={(selected.timelineEvents ?? []).map((event) => ({ children: `${event.toStatus ? labels[event.toStatus] : event.eventType}${event.note ? `：${event.note}` : ''}`, label: new Date(event.createdAt).toLocaleString() }))} />
      </>}
    </Drawer>
  </div>;
}
