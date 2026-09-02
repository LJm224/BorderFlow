import { Alert, Button, Card, Form, Input, message, Select, Space, Table, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { useAuthStore } from './auth';
import { ApiSuccess } from '@borderflow/shared';

interface Connection { id: string; channelType: string; status: string; externalStoreId?: string; store: { id: string; name: string; defaultCurrency: string }; skuMappings: { id: string; externalSku: string; sku: { id: string; skuCode: string; variantName: string; product: { id: string; name: string } } }[]; syncRuns: { id: string; status: string; totalItems: number; successItems: number; failedItems: number; startedAt: string; finishedAt?: string; logs: { resourceId?: string; status: string; errorCode?: string; message?: string }[] }[] }
interface Product { id: string; name: string; skus: { id: string; skuCode: string; variantName: string }[] }

const demoPayload = (externalOrderId: string) => JSON.stringify({ orders: [{ externalOrderId, orderNo: `BF-${externalOrderId}`, market: 'US', currency: 'USD', shippingCountry: 'US', financialStatus: 'paid', items: [{ externalSku: 'BF-BAG-BLACK', quantity: 1 }] }] }, null, 2);

export default function ShopifyPage() {
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>();
  const [shopDomain, setShopDomain] = useState('');
  const [ordersJson, setOrdersJson] = useState(() => demoPayload(`MOCK-${Date.now()}`));
  const [mappingForm] = Form.useForm();
  const user = useAuthStore((state) => state.user);
  const canWrite = user?.role === 'ADMIN' || user?.role === 'OPERATOR';
  const queryClient = useQueryClient();
  const connections = useQuery({ queryKey: ['channel-connections'], queryFn: async () => (await api.get<ApiSuccess<Connection[]>>('/channel-connections')).data.data });
  const products = useQuery({ enabled: canWrite, queryKey: ['channel-product-options'], queryFn: async () => (await api.get<ApiSuccess<{ items: Product[] }>>('/products', { params: { pageSize: 100 } })).data.data.items });
  const connection = useMemo(() => (connections.data ?? []).find((item) => item.id === (selectedConnectionId ?? connections.data?.[0]?.id)), [connections.data, selectedConnectionId]);
  const mapping = useMutation({ mutationFn: (values: { skuId: string; externalSku: string }) => api.post(`/channel-connections/${connection?.id}/sku-mappings`, values), onSuccess: () => { message.success('SKU 映射已保存'); mappingForm.resetFields(); queryClient.invalidateQueries({ queryKey: ['channel-connections'] }); }, onError: () => message.error('SKU 映射失败，外部 SKU 可能已被占用') });
  const importOrders = useMutation({ mutationFn: (payload: { orders: unknown[] }) => api.post(`/channel-connections/${connection?.id}/mock/import-orders`, payload), onSuccess: (response) => { const result = response.data?.data; message.success(`同步完成：成功 ${result?.successItems ?? 0}，失败 ${result?.failedItems ?? 0}`); queryClient.invalidateQueries({ queryKey: ['channel-connections'] }); queryClient.invalidateQueries({ queryKey: ['orders'] }); }, onError: () => message.error('Mock 同步失败，请检查 JSON 和 SKU 映射') });
  const oauth = useMutation({ mutationFn: async () => { if (!connection) throw new Error('请选择连接'); const response = await api.get<ApiSuccess<{ authorizationUrl: string }>>('/channel-connections/shopify/oauth/start', { params: { storeId: connection.store.id, shop: shopDomain.trim() } }); return response.data.data; }, onSuccess: (result) => window.location.assign(result.authorizationUrl), onError: () => message.error('OAuth 启动失败，请填写 *.myshopify.com 域名并检查服务端配置') });
  const skuOptions = (products.data ?? []).flatMap((product) => product.skus.map((sku) => ({ value: sku.id, label: `${sku.skuCode} · ${product.name}` })));

  const submitImport = () => {
    if (!connection) return;
    try {
      const parsed = JSON.parse(ordersJson) as { orders?: unknown[] };
      if (!Array.isArray(parsed.orders) || !parsed.orders.length) throw new Error('orders 必须是非空数组');
      importOrders.mutate({ orders: parsed.orders });
    } catch { message.error('JSON 格式不正确，请按示例填写'); }
  };

  return <div className="products-page">
    <div className="page-heading"><div><Typography.Title level={2}>Shopify 集成</Typography.Title><Typography.Text type="secondary">管理连接、SKU 映射并验收订单 Mock 同步</Typography.Text></div></div>
    {!connection && !connections.isLoading && <Alert type="warning" showIcon message="当前工作空间还没有 Shopify 连接" />}
    {connection && <div style={{ padding: 20, display: 'grid', gap: 16 }}>
      <Card size="small" title="连接概览" extra={<Select value={connection.id} onChange={setSelectedConnectionId} options={(connections.data ?? []).map((item) => ({ value: item.id, label: `${item.store.name} · ${item.channelType}` }))} style={{ minWidth: 220 }} />}><Space wrap><Tag color={connection.status === 'CONNECTED' ? 'green' : 'red'}>{connection.status === 'CONNECTED' ? '已连接' : connection.status}</Tag><Typography.Text type="secondary">外部店铺：{connection.externalStoreId ?? '未配置'}</Typography.Text><Typography.Text type="secondary">默认币种：{connection.store.defaultCurrency}</Typography.Text>{canWrite && <><Input value={shopDomain} onChange={(event) => setShopDomain(event.target.value)} placeholder="your-store.myshopify.com" style={{ width: 220 }} /><Button onClick={() => oauth.mutate()} loading={oauth.isPending}>开始 OAuth 授权</Button></>}</Space></Card>
      <Card size="small" title="SKU 映射">{canWrite && <Form form={mappingForm} layout="inline" onFinish={(values) => mapping.mutate(values)}><Form.Item name="skuId" rules={[{ required: true, message: '请选择本地 SKU' }]}><Select showSearch optionFilterProp="label" placeholder="选择本地 SKU" options={skuOptions} style={{ width: 280 }} /></Form.Item><Form.Item name="externalSku" rules={[{ required: true, message: '请输入外部 SKU' }]}><Input placeholder="例如 BF-BAG-BLACK" style={{ width: 220 }} /></Form.Item><Button type="primary" htmlType="submit" loading={mapping.isPending}>保存映射</Button></Form>}<Table size="small" rowKey="id" pagination={false} style={{ marginTop: 14 }} dataSource={connection.skuMappings} columns={[{ title: '外部 SKU', dataIndex: 'externalSku' }, { title: '本地 SKU', render: (_: unknown, item: Connection['skuMappings'][number]) => `${item.sku.skuCode} · ${item.sku.product.name}` }, { title: '变体', render: (_: unknown, item: Connection['skuMappings'][number]) => item.sku.variantName }]} /></Card>
      <Card size="small" title="Shopify Mock 订单导入" extra={<Button disabled={!canWrite} onClick={() => setOrdersJson(demoPayload(`MOCK-${Date.now()}`))}>填入 Demo JSON</Button>}><Input.TextArea value={ordersJson} onChange={(event) => setOrdersJson(event.target.value)} autoSize={{ minRows: 9, maxRows: 15 }} spellCheck={false} readOnly={!canWrite} /><Button type="primary" disabled={!canWrite} onClick={submitImport} loading={importOrders.isPending} style={{ marginTop: 12 }}>执行 Mock 同步</Button></Card>
      <Card size="small" title="最近同步记录"><Table size="small" rowKey="id" pagination={false} dataSource={connection.syncRuns} columns={[{ title: '开始时间', dataIndex: 'startedAt', render: (value: string) => new Date(value).toLocaleString() }, { title: '状态', dataIndex: 'status', render: (value: string) => <Tag color={value === 'COMPLETED' ? 'green' : value === 'FAILED' ? 'red' : 'processing'}>{value}</Tag> }, { title: '结果', render: (_: unknown, run: Connection['syncRuns'][number]) => `${run.successItems} 成功 / ${run.failedItems} 失败 / ${run.totalItems} 总计` }, { title: '错误', render: (_: unknown, run: Connection['syncRuns'][number]) => run.logs.filter((log) => log.status !== 'SUCCESS').map((log) => `${log.resourceId ?? '-'}: ${log.errorCode ?? log.message ?? log.status}`).join('；') || '—' }]} /></Card>
    </div>}
  </div>;
}
