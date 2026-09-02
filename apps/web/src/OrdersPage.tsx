import { Button, Descriptions, Drawer, Form, Input, InputNumber, message, Modal, Select, Space, Table, Tag, Timeline, Typography } from 'antd';
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
interface Store { id: string; name: string; defaultCurrency: string; isActive: boolean }
interface ProductOption { id: string; name: string; skus: { id: string; skuCode: string; variantName: string; price: string | number }[] }

const labels: Record<OrderStatus, string> = { PENDING_PAYMENT: '待付款', PAID: '已付款', PICKING: '拣货中', SHIPPED: '已发货', COMPLETED: '已完成', CANCELLED: '已取消', REFUNDED: '已退款' };
const statusColor: Record<OrderStatus, string> = { PENDING_PAYMENT: 'default', PAID: 'blue', PICKING: 'processing', SHIPPED: 'cyan', COMPLETED: 'green', CANCELLED: 'red', REFUNDED: 'orange' };

export default function OrdersPage() {
  const user = useAuthStore((state) => state.user);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<OrderStatus | undefined>();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Order | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm();
  const queryClient = useQueryClient();
  const canFulfill = user?.role === 'ADMIN' || user?.role === 'WAREHOUSE';
  const canCreate = user?.role === 'ADMIN' || user?.role === 'OPERATOR';
  const stores = useQuery({ queryKey: ['stores'], queryFn: async () => (await api.get<ApiSuccess<Store[]>>('/stores')).data.data });
  const productOptions = useQuery({ enabled: canCreate, queryKey: ['order-product-options'], queryFn: async () => (await api.get<ApiSuccess<{ items: ProductOption[] }>>('/products', { params: { pageSize: 100 } })).data.data.items });
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
  const createOrder = useMutation({
    mutationFn: (values: { storeId: string; shippingCountry: string; market?: string; currency?: string; status?: OrderStatus; items: { skuId: string; quantity: number }[] }) => api.post('/orders', values),
    onSuccess: () => { message.success('订单已创建'); setCreateOpen(false); createForm.resetFields(); queryClient.invalidateQueries({ queryKey: ['orders'] }); },
    onError: () => message.error('订单创建失败，请检查店铺、SKU 和库存配置'),
  });
  const pagination: TablePaginationConfig = { current: orders.data?.pagination.page ?? page, pageSize: 10, total: orders.data?.pagination.total ?? 0, showSizeChanger: false, onChange: (nextPage) => setPage(nextPage) };

  const displayedOrder = orderDetail.data ?? selected;
  return <div className="products-page">
    <div className="page-heading"><div><Typography.Title level={2}>订单与履约</Typography.Title><Typography.Text type="secondary">查看订单并处理发货流程</Typography.Text></div>{canCreate && <Button type="primary" onClick={() => { createForm.setFieldsValue({ status: 'PAID', items: [{}] }); setCreateOpen(true); }}>创建手工订单</Button>}</div>
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
    <Modal title="创建手工订单" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={() => createForm.submit()} confirmLoading={createOrder.isPending} okText="创建订单" cancelText="取消" destroyOnClose>
      <Form form={createForm} layout="vertical" onFinish={(values) => createOrder.mutate(values)} initialValues={{ status: 'PAID', items: [{}] }}>
        <Space.Compact block><Form.Item label="店铺" name="storeId" rules={[{ required: true, message: '请选择店铺' }]} style={{ width: '50%' }}><Select placeholder="选择店铺" options={(stores.data ?? []).filter((store) => store.isActive).map((store) => ({ value: store.id, label: store.name }))} /></Form.Item><Form.Item label="收货国家" name="shippingCountry" rules={[{ required: true, message: '请输入国家代码' }]} style={{ width: '50%' }}><Input placeholder="US" /></Form.Item></Space.Compact>
        <Space.Compact block><Form.Item label="市场" name="market" style={{ width: '50%' }}><Input placeholder="默认取商品市场" /></Form.Item><Form.Item label="币种" name="currency" style={{ width: '50%' }}><Select allowClear placeholder="跟随店铺" options={['USD', 'EUR', 'GBP', 'CNY'].map((value) => ({ value }))} /></Form.Item></Space.Compact>
        <Form.Item label="初始状态" name="status"><Select options={[{ value: 'PAID', label: '已付款（可进入拣货）' }, { value: 'PENDING_PAYMENT', label: '待付款' }]} /></Form.Item>
        <Typography.Text strong>订单商品</Typography.Text>
        <Form.List name="items">
          {(fields, { add, remove }) => <>{fields.map((field) => <Space key={field.key} align="baseline" style={{ display: 'flex', marginTop: 8 }}><Form.Item {...field} name={[field.name, 'skuId']} rules={[{ required: true, message: '请选择 SKU' }]}><Select showSearch optionFilterProp="label" placeholder="选择 SKU" style={{ width: 270 }} options={(productOptions.data ?? []).flatMap((product) => product.skus.map((sku) => ({ value: sku.id, label: `${sku.skuCode} · ${product.name}` })))} /></Form.Item><Form.Item {...field} name={[field.name, 'quantity']} rules={[{ required: true, message: '请输入数量' }]}><InputNumber min={1} precision={0} placeholder="数量" /></Form.Item>{fields.length > 1 && <Button type="link" onClick={() => remove(field.name)}>移除</Button>}</Space>)}<Button type="dashed" onClick={() => add()} block>+ 添加商品</Button></>}
        </Form.List>
      </Form>
    </Modal>
  </div>;
}

function nextOrderStatuses(status: OrderStatus): OrderStatus[] {
  if (status === 'PENDING_PAYMENT') return ['PAID', 'CANCELLED'];
  if (status === 'PAID') return ['PICKING', 'CANCELLED', 'REFUNDED'];
  if (status === 'PICKING') return ['SHIPPED', 'CANCELLED'];
  if (status === 'SHIPPED') return ['COMPLETED'];
  return [];
}
