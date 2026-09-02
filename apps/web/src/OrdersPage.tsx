import { Button, Descriptions, Drawer, Input, message, Select, Space, Table, Tag, Timeline, Typography } from 'antd';
import type { TablePaginationConfig } from 'antd';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { useAuthStore } from './auth';
import { ApiSuccess } from '@borderflow/shared';

type OrderStatus = 'PENDING_PAYMENT' | 'PAID' | 'PICKING' | 'SHIPPED' | 'COMPLETED' | 'CANCELLED' | 'REFUNDED';
interface OrderAllocation { id: string; quantity: number; status: 'RESERVED' | 'FULFILLED' | 'RELEASED'; inventory: { warehouse: { id: string; name: string } } }
interface OrderItem { id: string; quantity: number; unitPrice: string | number; sku: { skuCode: string; variantName: string; product?: { id: string; name: string } }; inventoryAllocations?: OrderAllocation[] }
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
  const orderDetail = useQuery({
    queryKey: ['order', selected?.id],
    enabled: Boolean(selected?.id),
    queryFn: async () => (await api.get<ApiSuccess<Order>>(`/orders/${selected?.id}`)).data.data,
  });
  const changeStatus = useMutation({
    mutationFn: ({ id, nextStatus }: { id: string; nextStatus: OrderStatus }) => api.patch(`/orders/${id}/status`, { status: nextStatus }),
    onSuccess: () => { message.success('订单状态已更新'); queryClient.invalidateQueries({ queryKey: ['orders'] }); setSelected(null); },
    onError: () => message.error('状态流转不合法或没有权限'),
  });
  const pagination: TablePaginationConfig = { current: orders.data?.pagination.page ?? page, pageSize: 10, total: orders.data?.pagination.total ?? 0, showSizeChanger: false, onChange: (nextPage) => setPage(nextPage) };

  const displayedOrder = orderDetail.data ?? selected;
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
    <Drawer className="order-drawer" title={displayedOrder ? `订单 ${displayedOrder.orderNo}` : '订单详情'} open={!!selected} onClose={() => setSelected(null)} width={560}>
      {displayedOrder && <><Descriptions column={1} size="small" items={[{ key: 'store', label: '店铺', children: displayedOrder.store.name }, { key: 'country', label: '收货国家', children: displayedOrder.shippingCountry }, { key: 'amount', label: '订单金额', children: `${displayedOrder.totalAmount} ${displayedOrder.currency}` }, { key: 'status', label: '状态', children: <Tag color={statusColor[displayedOrder.status]}>{labels[displayedOrder.status]}</Tag> }]} />
        <Typography.Title level={5}>订单商品</Typography.Title>
        <Table size="small" rowKey="id" pagination={false} dataSource={displayedOrder.items} columns={[{ title: 'SKU', dataIndex: ['sku', 'skuCode'] }, { title: '变体', dataIndex: ['sku', 'variantName'] }, { title: '仓库', render: (_: unknown, item: OrderItem) => item.inventoryAllocations?.length ? item.inventoryAllocations.map((allocation) => `${allocation.inventory.warehouse.name} × ${allocation.quantity}`).join('、') : '待分配' }, { title: '数量', dataIndex: 'quantity' }, { title: '单价', dataIndex: 'unitPrice' }]} />
        {canFulfill && <Select className="order-status-control" placeholder="推进订单状态" options={nextOrderStatuses(displayedOrder.status).map((value) => ({ value, label: labels[value] }))} onChange={(nextStatus: OrderStatus) => changeStatus.mutate({ id: displayedOrder.id, nextStatus })} />}
        <Typography.Title level={5}>状态时间线</Typography.Title>
        <Timeline items={(displayedOrder.timelineEvents ?? []).map((event) => ({
          children: <div className="order-timeline-content">
            <span className="order-timeline-title">{`${event.toStatus ? labels[event.toStatus] : event.eventType}${event.note ? `：${event.note}` : ''}`}</span>
            <time className="order-timeline-time" dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time>
          </div>,
        }))} />
      </>}
    </Drawer>
  </div>;
}

function nextOrderStatuses(status: OrderStatus): OrderStatus[] {
  if (status === 'PENDING_PAYMENT') return ['PAID', 'CANCELLED'];
  if (status === 'PAID') return ['PICKING', 'CANCELLED', 'REFUNDED'];
  if (status === 'PICKING') return ['SHIPPED', 'CANCELLED'];
  if (status === 'SHIPPED') return ['COMPLETED'];
  return [];
}
