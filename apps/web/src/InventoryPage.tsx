import { Button, Form, Input, InputNumber, message, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import type { TablePaginationConfig } from 'antd';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { useAuthStore } from './auth';
import { ApiSuccess } from '@borderflow/shared';

type InventoryType = 'RESTOCK' | 'SALE' | 'ADJUSTMENT';
type InventoryTransactionType = 'SALE' | 'RESTOCK' | 'RESERVATION' | 'RELEASE' | 'ADJUSTMENT';
interface Inventory { id: string; skuId: string; warehouseId: string; availableQuantity: number; lockedQuantity: number; alertThreshold: number; sku: { skuCode: string; variantName: string; product: { id: string; name: string } }; warehouse: { name: string; store: { name: string } } }
interface InventoryList { items: Inventory[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }
interface InventoryTransaction { id: string; type: InventoryTransactionType; quantity: number; referenceId?: string | null; reason?: string | null; beforeAvailable?: number | null; afterAvailable?: number | null; beforeLocked?: number | null; afterLocked?: number | null; createdAt: string }

export default function InventoryPage() {
  const user = useAuthStore((state) => state.user);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Inventory | null>(null);
  const [transactionsFor, setTransactionsFor] = useState<Inventory | null>(null);
  const [form] = Form.useForm();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const canWrite = user?.role === 'ADMIN' || user?.role === 'WAREHOUSE';
  const skuId = searchParams.get('skuId') ?? undefined;
  const productId = searchParams.get('productId') ?? undefined;
  const warehouseId = searchParams.get('warehouseId') ?? undefined;
  const inventory = useQuery({ queryKey: ['inventory', keyword, page, skuId, productId, warehouseId], queryFn: async () => (await api.get<ApiSuccess<InventoryList>>('/inventory', { params: { keyword: keyword || undefined, skuId, productId, warehouseId, page, pageSize: 10 } })).data.data });
  const transactions = useQuery({ queryKey: ['inventory-transactions', transactionsFor?.id], enabled: Boolean(transactionsFor?.id), queryFn: async () => (await api.get<ApiSuccess<InventoryTransaction[]>>(`/inventory/${transactionsFor?.id}/transactions`)).data.data });
  const adjust = useMutation({
    mutationFn: (values: { type: InventoryType; quantity: number; reason?: string }) => api.patch('/inventory/adjust', { skuId: selected?.skuId, warehouseId: selected?.warehouseId, ...values }),
    onSuccess: () => { message.success('库存已调整'); setSelected(null); queryClient.invalidateQueries({ queryKey: ['inventory'] }); },
    onError: () => message.error('库存调整失败，请检查库存数量和权限'),
  });
  const openAdjust = (item: Inventory) => { setSelected(item); form.resetFields(); form.setFieldsValue({ type: 'RESTOCK', quantity: 1 }); };
  const pagination: TablePaginationConfig = { current: inventory.data?.pagination.page ?? page, pageSize: 10, total: inventory.data?.pagination.total ?? 0, showSizeChanger: false, onChange: (nextPage) => setPage(nextPage) };

  return <div className="products-page">
    <div className="page-heading"><div><Typography.Title level={2}>库存管理</Typography.Title><Typography.Text type="secondary">查看 SKU 库存并记录入库、出库和调整</Typography.Text></div></div>
    <Space className="product-toolbar"><Input.Search allowClear placeholder="搜索 SKU、商品或仓库" value={keyword} onChange={(event) => { setKeyword(event.target.value); setPage(1); }} style={{ width: 320 }} /></Space>
    <Table rowKey="id" loading={inventory.isLoading} dataSource={inventory.data?.items ?? []} pagination={pagination} columns={[
      { title: 'SKU / 商品', render: (_: unknown, item: Inventory) => <div><Typography.Text strong>{item.sku.skuCode}</Typography.Text><div className="muted"><Link to={`/products/${item.sku.product.id}`}>{item.sku.product.name}</Link> · {item.sku.variantName}</div></div> },
      { title: '仓库', render: (_: unknown, item: Inventory) => `${item.warehouse.store.name} / ${item.warehouse.name}` },
      { title: '可用库存', dataIndex: 'availableQuantity', render: (value: number, item: Inventory) => <Typography.Text type={value <= item.alertThreshold ? 'danger' : undefined}>{value}</Typography.Text> },
      { title: '锁定库存', dataIndex: 'lockedQuantity' },
      { title: '状态', render: (_: unknown, item: Inventory) => item.availableQuantity <= item.alertThreshold ? <Tag color="orange">库存预警</Tag> : <Tag color="green">正常</Tag> },
      { title: '操作', render: (_: unknown, item: Inventory) => <Space><Button type="link" disabled={!canWrite} onClick={() => openAdjust(item)}>调整库存</Button><Button type="link" onClick={() => setTransactionsFor(item)}>查看流水</Button></Space> },
    ]} />
    <Modal title="调整库存" open={!!selected} onCancel={() => setSelected(null)} onOk={() => form.submit()} confirmLoading={adjust.isPending} okText="保存" cancelText="取消">
      {selected && <><DescriptionsLike label="SKU" value={`${selected.sku.skuCode} · ${selected.sku.product.name}`} /><DescriptionsLike label="仓库" value={`${selected.warehouse.store.name} / ${selected.warehouse.name}`} /><DescriptionsLike label="当前可用" value={String(selected.availableQuantity)} /><DescriptionsLike label="锁定库存" value={String(selected.lockedQuantity)} /><Form form={form} layout="vertical" onFinish={(values) => adjust.mutate(values)}><Form.Item label="操作类型" name="type" rules={[{ required: true }]}><Select options={[{ value: 'RESTOCK', label: '入库（增加）' }, { value: 'SALE', label: '出库（减少）' }, { value: 'ADJUSTMENT', label: '盘点调整（可正可负）' }]} /></Form.Item><Form.Item label="数量" name="quantity" rules={[{ required: true, message: '请输入数量' }]}><InputNumber style={{ width: '100%' }} /></Form.Item><Form.Item label="原因" name="reason"><Input.TextArea rows={2} placeholder="例如：采购入库、盘点修正" /></Form.Item></Form></>}
    </Modal>
    <Modal title={transactionsFor ? `库存流水 · ${transactionsFor.sku.skuCode}` : '库存流水'} open={!!transactionsFor} onCancel={() => setTransactionsFor(null)} footer={null} width={720}>
      {transactionsFor && <Table size="small" rowKey="id" loading={transactions.isLoading} dataSource={transactions.data ?? []} pagination={false} scroll={{ x: 640 }} columns={[{ title: '时间', dataIndex: 'createdAt', render: (value: string) => new Date(value).toLocaleString() }, { title: '类型', dataIndex: 'type', render: (value: InventoryTransactionType) => ({ RESTOCK: '入库', SALE: '出库', RESERVATION: '锁库', RELEASE: '释放', ADJUSTMENT: '盘点调整' }[value]) }, { title: '数量', dataIndex: 'quantity' }, { title: '可用库存', render: (_: unknown, item: InventoryTransaction) => item.afterAvailable == null ? '—' : `${item.beforeAvailable ?? '—'} → ${item.afterAvailable}` }, { title: '锁定库存', render: (_: unknown, item: InventoryTransaction) => item.afterLocked == null ? '—' : `${item.beforeLocked ?? '—'} → ${item.afterLocked}` }, { title: '原因', render: (_: unknown, item: InventoryTransaction) => item.reason ?? '—' }]} />}
    </Modal>
  </div>;
}

function DescriptionsLike({ label, value }: { label: string; value: string }) { return <div className="inventory-summary"><Typography.Text type="secondary">{label}</Typography.Text><Typography.Text>{value}</Typography.Text></div>; }
