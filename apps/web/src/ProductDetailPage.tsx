import { Alert, Button, Card, Form, Input, InputNumber, List, message, Modal, Popconfirm, Select, Space, Spin, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from './api';
import { useAuthStore } from './auth';
import { ApiSuccess } from '@borderflow/shared';

type ProductStatus = 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'OFFLINE';
type Currency = 'USD' | 'EUR' | 'GBP' | 'CNY';
interface Inventory { id: string; warehouseId: string; availableQuantity: number; lockedQuantity: number; alertThreshold: number; warehouse: { id: string; name: string; store: { id: string; name: string } } }
interface Sku { id: string; skuCode: string; variantName: string; price: string | number; costPrice: string | number; weight: string | number; inventories?: Inventory[] }
interface Product { id: string; name: string; description: string; market: string; currency: Currency; status: ProductStatus; updatedAt?: string; skus: Sku[]; marketContents?: { market: string; locale: string; title?: string | null; status: ProductStatus }[]; media?: { id: string; url: string; mediaType: string; altText?: string | null }[] }
interface SkuFormValues { skuCode: string; variantName: string; price: number; costPrice: number; weight: number }
interface Warehouse { id: string; name: string; store: { id: string; name: string } }
interface InventoryFormValues { warehouseId: string; initialQuantity: number; alertThreshold: number }

const statusLabels: Record<ProductStatus, string> = { DRAFT: '草稿', PENDING_REVIEW: '待审核', PUBLISHED: '已发布', OFFLINE: '已下架' };

function nextStatuses(status: ProductStatus): ProductStatus[] {
  if (status === 'DRAFT') return ['PENDING_REVIEW'];
  if (status === 'PENDING_REVIEW') return ['DRAFT', 'PUBLISHED'];
  if (status === 'PUBLISHED') return ['OFFLINE'];
  return ['DRAFT', 'PUBLISHED'];
}

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const [form] = Form.useForm<Pick<Product, 'name' | 'description' | 'market' | 'currency'>>();
  const [skuForm] = Form.useForm<SkuFormValues>();
  const [skuModalOpen, setSkuModalOpen] = useState(false);
  const [editingSku, setEditingSku] = useState<Sku | null>(null);
  const [inventoryModalOpen, setInventoryModalOpen] = useState(false);
  const [inventorySku, setInventorySku] = useState<Sku | null>(null);
  const canWrite = user?.role === 'ADMIN' || user?.role === 'OPERATOR';
  const canApprove = canWrite;
  const canManageInventory = user?.role === 'ADMIN' || user?.role === 'WAREHOUSE';
  const productQuery = useQuery({
    queryKey: ['product', id],
    enabled: Boolean(id),
    queryFn: async () => (await api.get<ApiSuccess<Product>>(`/products/${id}`)).data.data,
  });
  const warehouses = useQuery({
    queryKey: ['inventory-warehouses'],
    enabled: inventoryModalOpen,
    queryFn: async () => (await api.get<ApiSuccess<Warehouse[]>>('/inventory/warehouses')).data.data,
  });

  useEffect(() => {
    if (productQuery.data) form.setFieldsValue({ name: productQuery.data.name, description: productQuery.data.description, market: productQuery.data.market, currency: productQuery.data.currency });
  }, [form, productQuery.data]);

  const save = useMutation({
    mutationFn: (values: Pick<Product, 'name' | 'description' | 'market' | 'currency'>) => api.patch(`/products/${id}`, values),
    onSuccess: async () => { message.success('商品已保存'); await productQuery.refetch(); queryClient.invalidateQueries({ queryKey: ['products'] }); },
    onError: () => message.error('保存失败，请检查权限或输入内容'),
  });
  const changeStatus = useMutation({
    mutationFn: (status: ProductStatus) => api.patch(`/products/${id}/status`, { status }),
    onSuccess: async () => { message.success('商品状态已更新'); await productQuery.refetch(); queryClient.invalidateQueries({ queryKey: ['products'] }); },
    onError: (error) => message.error((error as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message ?? '状态流转失败'),
  });
  const saveSku = useMutation({
    mutationFn: (values: SkuFormValues) => editingSku ? api.patch(`/products/${id}/skus/${editingSku.id}`, values) : api.post(`/products/${id}/skus`, values),
    onSuccess: async () => { message.success(editingSku ? 'SKU 已更新' : 'SKU 已添加'); setSkuModalOpen(false); await productQuery.refetch(); },
    onError: () => message.error('SKU 保存失败，请检查编码是否重复'),
  });
  const deleteSku = useMutation({
    mutationFn: (skuId: string) => api.delete(`/products/${id}/skus/${skuId}`),
    onSuccess: async () => { message.success('SKU 已删除'); await productQuery.refetch(); },
    onError: (error) => message.error((error as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message ?? 'SKU 删除失败'),
  });
  const [inventoryForm] = Form.useForm<InventoryFormValues>();
  const initializeInventory = useMutation({
    mutationFn: (values: InventoryFormValues) => api.post('/inventory/records', { skuId: inventorySku?.id, ...values }),
    onSuccess: async () => { message.success('库存档案已创建'); setInventoryModalOpen(false); setInventorySku(null); await productQuery.refetch(); queryClient.invalidateQueries({ queryKey: ['inventory'] }); },
    onError: (error) => message.error((error as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message ?? '库存档案创建失败'),
  });

  if (productQuery.isLoading) return <div className="auth-loading"><Spin /></div>;
  if (productQuery.isError || !productQuery.data) return <Alert type="error" showIcon message="商品不存在或加载失败" action={<Button onClick={() => navigate('/products')}>返回商品列表</Button>} />;
  const product = productQuery.data;

  const openAddSku = () => { setEditingSku(null); skuForm.resetFields(); skuForm.setFieldsValue({ price: 0, costPrice: 0, weight: 0 }); setSkuModalOpen(true); };
  const openEditSku = (sku: Sku) => { setEditingSku(sku); skuForm.setFieldsValue({ skuCode: sku.skuCode, variantName: sku.variantName, price: Number(sku.price), costPrice: Number(sku.costPrice), weight: Number(sku.weight) }); setSkuModalOpen(true); };
  const openInventorySetup = (sku: Sku) => { setInventorySku(sku); inventoryForm.resetFields(); inventoryForm.setFieldsValue({ initialQuantity: 0, alertThreshold: 0 }); setInventoryModalOpen(true); };

  return <div className="products-page product-detail-page">
    <div className="page-heading"><div><Link to="/products">← 返回商品列表</Link><Typography.Title level={2}>{product.name}</Typography.Title><Typography.Text type="secondary">{product.market} · {product.currency} · 最后更新 {new Date(productQuery.data.updatedAt ?? Date.now()).toLocaleString()}</Typography.Text></div><Tag color={product.status === 'PUBLISHED' ? 'green' : product.status === 'OFFLINE' ? 'default' : 'blue'}>{statusLabels[product.status]}</Tag></div>
    <Card title="基本信息" extra={canWrite && <Button type="primary" loading={save.isPending} onClick={() => form.submit()}>保存商品</Button>}>
      <Form form={form} layout="vertical" onFinish={(values) => save.mutate(values)} disabled={!canWrite}>
        <Form.Item label="商品名称" name="name" rules={[{ required: true, message: '请输入商品名称' }]}><Input /></Form.Item>
        <Form.Item label="描述" name="description"><Input.TextArea rows={4} /></Form.Item>
        <Space.Compact block><Form.Item label="市场" name="market" rules={[{ required: true }]} style={{ width: '50%' }}><Input /></Form.Item><Form.Item label="币种" name="currency" rules={[{ required: true }]} style={{ width: '50%' }}><Select options={['USD', 'EUR', 'GBP', 'CNY'].map((value) => ({ value }))} /></Form.Item></Space.Compact>
      </Form>
    </Card>
    <Card title="审核与发布" style={{ marginTop: 16 }}>
      <Space wrap>{canApprove && nextStatuses(product.status).map((status) => <Button key={status} onClick={() => changeStatus.mutate(status)} loading={changeStatus.isPending}>{status === 'PENDING_REVIEW' ? '提交审核' : statusLabels[status]}</Button>)}</Space>
      {!canApprove && <Typography.Text type="secondary">当前角色无权修改商品审核状态</Typography.Text>}
    </Card>
    <Card title="SKU 变体" style={{ marginTop: 16 }} extra={canWrite && <Button onClick={openAddSku}>添加 SKU</Button>}>
      <List dataSource={product.skus} locale={{ emptyText: '暂无 SKU' }} renderItem={(sku) => {
        const available = (sku.inventories ?? []).reduce((sum, item) => sum + item.availableQuantity, 0);
        const locked = (sku.inventories ?? []).reduce((sum, item) => sum + item.lockedQuantity, 0);
        const inventoryActions = canManageInventory ? [<Button key="inventory" type="link" onClick={() => openInventorySetup(sku)}>配置库存</Button>] : [];
        const skuActions = canWrite ? [<Button key="edit" type="link" onClick={() => openEditSku(sku)}>编辑</Button>, <Popconfirm key="delete" title="确认删除这个 SKU？" description="已被订单或库存使用的 SKU 不能删除。" onConfirm={() => deleteSku.mutate(sku.id)}><Button type="link" danger loading={deleteSku.isPending}>删除</Button></Popconfirm>] : [];
        return <List.Item actions={[...inventoryActions, ...skuActions]}><List.Item.Meta title={<Space><Typography.Text strong>{sku.skuCode}</Typography.Text><Link to={`/inventory?skuId=${sku.id}`}>查看库存</Link></Space>} description={<div>{sku.variantName} · 售价 {sku.price} · 成本 {sku.costPrice} · 重量 {sku.weight}<div className="muted">可用 {available} · 锁定 {locked} · {sku.inventories?.length ? `已配置 ${sku.inventories.length} 个仓库` : '尚未配置仓库库存'}</div></div>} /></List.Item>;
      }} />
    </Card>
    <Card title="目标市场内容" style={{ marginTop: 16 }}>
      {product.marketContents?.length ? <List dataSource={product.marketContents} renderItem={(content) => <List.Item><List.Item.Meta title={`${content.market} · ${content.locale}`} description={content.title ?? '尚未填写标题'} /><Tag>{statusLabels[content.status]}</Tag></List.Item>} /> : <Typography.Text type="secondary">暂无市场内容，后续可由 AI Agent 生成。</Typography.Text>}
    </Card>
    {product.media?.length ? <Card title="媒体" style={{ marginTop: 16 }}><List dataSource={product.media} renderItem={(media) => <List.Item><Typography.Link href={media.url} target="_blank">{media.altText ?? media.url}</Typography.Link><Tag>{media.mediaType}</Tag></List.Item>} /></Card> : null}
    <Modal title={editingSku ? '编辑 SKU' : '添加 SKU'} open={skuModalOpen} onCancel={() => setSkuModalOpen(false)} onOk={() => skuForm.submit()} confirmLoading={saveSku.isPending} okText="保存" cancelText="取消">
      <Form form={skuForm} layout="vertical" onFinish={(values) => saveSku.mutate(values)}>
        <Form.Item label="SKU 编码" name="skuCode" rules={[{ required: true, message: '请输入 SKU 编码' }]}><Input disabled={Boolean(editingSku)} /></Form.Item>
        <Form.Item label="变体名称" name="variantName" rules={[{ required: true, message: '请输入变体名称' }]}><Input /></Form.Item>
        <Space.Compact block><Form.Item label="售价" name="price" rules={[{ required: true }]} style={{ width: '33%' }}><InputNumber min={0} precision={2} style={{ width: '100%' }} /></Form.Item><Form.Item label="成本" name="costPrice" rules={[{ required: true }]} style={{ width: '33%' }}><InputNumber min={0} precision={2} style={{ width: '100%' }} /></Form.Item><Form.Item label="重量" name="weight" rules={[{ required: true }]} style={{ width: '34%' }}><InputNumber min={0} precision={3} style={{ width: '100%' }} /></Form.Item></Space.Compact>
      </Form>
    </Modal>
    <Modal title={`配置库存${inventorySku ? ` · ${inventorySku.skuCode}` : ''}`} open={inventoryModalOpen} onCancel={() => { setInventoryModalOpen(false); setInventorySku(null); }} onOk={() => inventoryForm.submit()} confirmLoading={initializeInventory.isPending} okText="创建库存档案" cancelText="取消">
      <Form form={inventoryForm} layout="vertical" onFinish={(values) => initializeInventory.mutate(values)}>
        <Form.Item label="仓库" name="warehouseId" rules={[{ required: true, message: '请选择仓库' }]}><Select loading={warehouses.isLoading} placeholder="请选择仓库" options={(warehouses.data ?? []).filter((warehouse) => !inventorySku?.inventories?.some((item) => item.warehouseId === warehouse.id)).map((warehouse) => ({ value: warehouse.id, label: `${warehouse.store.name} / ${warehouse.name}` }))} /></Form.Item>
        <Form.Item label="期初库存" name="initialQuantity" rules={[{ required: true, message: '请输入期初库存' }]}><InputNumber min={0} precision={0} style={{ width: '100%' }} /></Form.Item>
        <Form.Item label="库存预警阈值" name="alertThreshold" rules={[{ required: true, message: '请输入预警阈值' }]}><InputNumber min={0} precision={0} style={{ width: '100%' }} /></Form.Item>
      </Form>
    </Modal>
  </div>;
}
