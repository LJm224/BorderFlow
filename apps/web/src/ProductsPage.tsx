import { Button, Form, Input, InputNumber, message, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import type { TablePaginationConfig } from 'antd';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { useAuthStore } from './auth';
import { ApiSuccess } from '@borderflow/shared';

type ProductStatus = 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'OFFLINE';
type Currency = 'USD' | 'EUR' | 'GBP' | 'CNY';
interface Sku { id: string; skuCode: string; variantName: string; price: string | number; costPrice: string | number; weight: string | number }
interface Product { id: string; name: string; description: string; market: string; currency: Currency; status: ProductStatus; skus: Sku[]; updatedAt: string }
interface ProductList { items: Product[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }

const statusLabels: Record<ProductStatus, string> = { DRAFT: '草稿', PENDING_REVIEW: '待审核', PUBLISHED: '已发布', OFFLINE: '已下架' };

export default function ProductsPage() {
  const user = useAuthStore((state) => state.user);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  const canWrite = user?.role === 'ADMIN' || user?.role === 'OPERATOR';
  const canApprove = canWrite;

  const products = useQuery({
    queryKey: ['products', keyword, page],
    queryFn: async () => (await api.get<ApiSuccess<ProductList>>('/products', { params: { keyword: keyword || undefined, page, pageSize: 10 } })).data.data,
  });

  const save = useMutation({
    mutationFn: async (values: { name: string; description: string; market: string; currency: Currency; skuCode?: string; variantName?: string; price?: number; costPrice?: number; weight?: number }) => {
      const payload = { name: values.name, description: values.description, market: values.market, currency: values.currency };
      if (editing) return api.patch(`/products/${editing.id}`, payload);
      const skus = values.skuCode ? [{ skuCode: values.skuCode, variantName: values.variantName || '默认', price: values.price ?? 0, costPrice: values.costPrice ?? 0, weight: values.weight ?? 0 }] : undefined;
      return api.post('/products', { ...payload, skus });
    },
    onSuccess: () => { message.success(editing ? '商品已更新' : '商品已创建'); setModalOpen(false); queryClient.invalidateQueries({ queryKey: ['products'] }); },
    onError: () => message.error('保存失败，请检查权限或输入内容'),
  });

  const changeStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ProductStatus }) => api.patch(`/products/${id}/status`, { status }),
    onSuccess: () => { message.success('商品状态已更新'); queryClient.invalidateQueries({ queryKey: ['products'] }); },
    onError: () => message.error('状态更新失败'),
  });

  const openCreate = () => { setEditing(null); form.resetFields(); form.setFieldsValue({ currency: 'USD', market: 'US' }); setModalOpen(true); };
  const openEdit = (product: Product) => { setEditing(product); form.setFieldsValue({ name: product.name, description: product.description, market: product.market, currency: product.currency }); setModalOpen(true); };
  const pagination: TablePaginationConfig = { current: products.data?.pagination.page ?? page, pageSize: 10, total: products.data?.pagination.total ?? 0, showSizeChanger: false, onChange: (nextPage) => setPage(nextPage) };

  return <div className="products-page">
    <div className="page-heading"><div><Typography.Title level={2}>商品与 SKU</Typography.Title><Typography.Text type="secondary">管理商品基础信息、价格和 SKU</Typography.Text></div>{canWrite && <Button type="primary" onClick={openCreate}>新建商品</Button>}</div>
    <Space className="product-toolbar"><Input.Search allowClear placeholder="搜索商品名或 SKU 编码" value={keyword} onChange={(event) => { setKeyword(event.target.value); setPage(1); }} onSearch={() => setPage(1)} style={{ width: 320 }} /></Space>
    <Table rowKey="id" loading={products.isLoading} dataSource={products.data?.items ?? []} pagination={pagination} columns={[
      { title: '商品名称', dataIndex: 'name', render: (name: string, product: Product) => <div><Typography.Text strong>{name}</Typography.Text><div className="muted">{product.market} · {product.currency}</div></div> },
      { title: 'SKU', render: (_: unknown, product: Product) => product.skus.length ? product.skus.map((sku) => <Tag key={sku.id}>{sku.skuCode}</Tag>) : <Typography.Text type="secondary">暂无 SKU</Typography.Text> },
      { title: '状态', dataIndex: 'status', render: (status: ProductStatus) => <Tag color={status === 'PUBLISHED' ? 'green' : status === 'OFFLINE' ? 'default' : 'blue'}>{statusLabels[status]}</Tag> },
      { title: '操作', render: (_: unknown, product: Product) => <Space><Button type="link" onClick={() => openEdit(product)} disabled={!canWrite}>编辑</Button>{canApprove && <Select size="small" value={product.status} options={Object.entries(statusLabels).map(([value, label]) => ({ value, label }))} onChange={(status: ProductStatus) => changeStatus.mutate({ id: product.id, status })} />}</Space> },
    ]} />
    <Modal title={editing ? '编辑商品' : '新建商品'} open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()} confirmLoading={save.isPending} okText="保存" cancelText="取消">
      <Form form={form} layout="vertical" onFinish={(values) => save.mutate(values)}>
        <Form.Item label="商品名称" name="name" rules={[{ required: true, message: '请输入商品名称' }]}><Input /></Form.Item>
        <Form.Item label="描述" name="description"><Input.TextArea rows={3} /></Form.Item>
        <Space.Compact block><Form.Item label="市场" name="market" rules={[{ required: true }]} style={{ width: '50%' }}><Input /></Form.Item><Form.Item label="币种" name="currency" rules={[{ required: true }]} style={{ width: '50%' }}><Select options={['USD', 'EUR', 'GBP', 'CNY'].map((value) => ({ value }))} /></Form.Item></Space.Compact>
        {!editing && <><Typography.Title level={5}>首个 SKU（可选）</Typography.Title><Form.Item label="SKU 编码" name="skuCode"><Input /></Form.Item><Form.Item label="变体名称" name="variantName"><Input placeholder="例如 Black / Standard" /></Form.Item><Space.Compact block><Form.Item label="售价" name="price"><InputNumber min={0} precision={2} style={{ width: '33%' }} /></Form.Item><Form.Item label="成本" name="costPrice"><InputNumber min={0} precision={2} style={{ width: '33%' }} /></Form.Item><Form.Item label="重量" name="weight"><InputNumber min={0} precision={3} style={{ width: '34%' }} /></Form.Item></Space.Compact></>}
      </Form>
    </Modal>
  </div>;
}
