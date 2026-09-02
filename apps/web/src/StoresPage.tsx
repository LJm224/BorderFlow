import { Button, Form, Input, message, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { useAuthStore } from './auth';
import { ApiSuccess } from '@borderflow/shared';

type ChannelType = 'SHOPIFY' | 'AMAZON' | 'SHOPLINE';
interface Warehouse { id: string; name: string; createdAt: string; _count?: { inventories: number } }
interface Store { id: string; name: string; channelType: ChannelType; defaultCurrency: string; timezone: string; isActive: boolean; warehouses: Warehouse[]; connections: { id: string; status: string; lastSyncedAt?: string }[] }

export default function StoresPage() {
  const user = useAuthStore((state) => state.user);
  const canWrite = user?.role === 'ADMIN' || user?.role === 'OPERATOR';
  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [warehouseModalOpen, setWarehouseModalOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
  const [storeForm] = Form.useForm();
  const [warehouseForm] = Form.useForm();
  const queryClient = useQueryClient();
  const stores = useQuery({ queryKey: ['stores'], queryFn: async () => (await api.get<ApiSuccess<Store[]>>('/stores')).data.data });
  const saveStore = useMutation({ mutationFn: (values: { name: string; channelType: ChannelType; defaultCurrency: string; timezone: string }) => editingStore ? api.patch(`/stores/${editingStore.id}`, values) : api.post('/stores', values), onSuccess: () => { message.success(editingStore ? '店铺已更新' : '店铺已创建'); setStoreModalOpen(false); queryClient.invalidateQueries({ queryKey: ['stores'] }); }, onError: () => message.error('店铺保存失败，名称可能已存在') });
  const saveWarehouse = useMutation({ mutationFn: async (values: { storeId: string; name: string }) => { if (editingWarehouse) await api.patch(`/warehouses/${editingWarehouse.id}`, { name: values.name }); else await api.post('/warehouses', values); }, onSuccess: () => { message.success(editingWarehouse ? '仓库已更新' : '仓库已创建'); setWarehouseModalOpen(false); queryClient.invalidateQueries({ queryKey: ['stores'] }); }, onError: () => message.error('仓库保存失败，名称可能已存在') });
  const openCreateStore = () => { setEditingStore(null); storeForm.resetFields(); storeForm.setFieldsValue({ channelType: 'SHOPIFY', defaultCurrency: 'USD', timezone: 'UTC' }); setStoreModalOpen(true); };
  const openEditStore = (store: Store) => { setEditingStore(store); storeForm.setFieldsValue({ name: store.name, channelType: store.channelType, defaultCurrency: store.defaultCurrency, timezone: store.timezone, isActive: store.isActive }); setStoreModalOpen(true); };
  const openWarehouse = (store: Store, warehouse?: Warehouse) => { setEditingWarehouse(warehouse ?? null); warehouseForm.setFieldsValue({ storeId: store.id, name: warehouse?.name }); setWarehouseModalOpen(true); };

  return <div className="products-page">
    <div className="page-heading"><div><Typography.Title level={2}>店铺与仓库</Typography.Title><Typography.Text type="secondary">统一管理销售店铺、履约仓库和渠道连接</Typography.Text></div>{canWrite && <Button type="primary" onClick={openCreateStore}>新建店铺</Button>}</div>
    <Table rowKey="id" loading={stores.isLoading} dataSource={stores.data ?? []} pagination={false} columns={[
      { title: '店铺', render: (_: unknown, store: Store) => <div><Typography.Text strong>{store.name}</Typography.Text><div className="muted">{store.channelType} · {store.defaultCurrency} · {store.timezone}</div></div> },
      { title: '连接状态', render: (_: unknown, store: Store) => store.connections.map((connection) => <Tag key={connection.id} color={connection.status === 'CONNECTED' ? 'green' : 'default'}>{connection.status === 'CONNECTED' ? '已连接' : connection.status}</Tag>) },
      { title: '仓库', render: (_: unknown, store: Store) => <Space wrap>{store.warehouses.map((warehouse) => <Tag key={warehouse.id}>{warehouse.name} · {warehouse._count?.inventories ?? 0} SKU</Tag>)}</Space> },
      { title: '操作', render: (_: unknown, store: Store) => <Space><Button type="link" onClick={() => openEditStore(store)} disabled={!canWrite}>编辑店铺</Button>{canWrite && <Button type="link" onClick={() => openWarehouse(store)}>新增仓库</Button>}</Space> },
    ]} />
    <Modal title={editingStore ? '编辑店铺' : '新建店铺'} open={storeModalOpen} onCancel={() => setStoreModalOpen(false)} onOk={() => storeForm.submit()} confirmLoading={saveStore.isPending} okText="保存" cancelText="取消" destroyOnClose>
      <Form form={storeForm} layout="vertical" onFinish={(values) => saveStore.mutate(values)}><Form.Item label="店铺名称" name="name" rules={[{ required: true, message: '请输入店铺名称' }]}><Input /></Form.Item><Form.Item label="渠道类型" name="channelType" rules={[{ required: true }]}><Select disabled={Boolean(editingStore)} options={['SHOPIFY', 'AMAZON', 'SHOPLINE'].map((value) => ({ value, label: value }))} /></Form.Item><Space.Compact block><Form.Item label="默认币种" name="defaultCurrency" style={{ width: '50%' }}><Select options={['USD', 'EUR', 'GBP', 'CNY'].map((value) => ({ value }))} /></Form.Item><Form.Item label="时区" name="timezone" style={{ width: '50%' }}><Input /></Form.Item></Space.Compact>{editingStore && <Form.Item label="状态" name="isActive"><Select options={[{ value: true, label: '启用' }, { value: false, label: '停用' }]} /></Form.Item>}</Form>
    </Modal>
    <Modal title={editingWarehouse ? '编辑仓库' : '新建仓库'} open={warehouseModalOpen} onCancel={() => setWarehouseModalOpen(false)} onOk={() => warehouseForm.submit()} confirmLoading={saveWarehouse.isPending} okText="保存" cancelText="取消" destroyOnClose>
      <Form form={warehouseForm} layout="vertical" onFinish={(values) => saveWarehouse.mutate(values)}><Form.Item label="所属店铺" name="storeId" rules={[{ required: true }]}><Select disabled={Boolean(editingWarehouse)} options={(stores.data ?? []).map((store) => ({ value: store.id, label: store.name }))} /></Form.Item><Form.Item label="仓库名称" name="name" rules={[{ required: true, message: '请输入仓库名称' }]}><Input /></Form.Item></Form>
    </Modal>
  </div>;
}
