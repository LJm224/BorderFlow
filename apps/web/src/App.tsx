import { Alert, Button, Card, Form, Input, Layout, Spin, Tag, Typography } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useAuthStore } from './auth';
import { ApiSuccess } from '@borderflow/shared';
import ProductsPage from './ProductsPage';
import OrdersPage from './OrdersPage';
import InventoryPage from './InventoryPage';

const { Header, Content, Sider } = Layout;
function HealthBadge() {
  const { data, isError, isLoading } = useQuery({
    queryKey: ['health'],
    queryFn: async () => (await api.get<ApiSuccess<{ status: string }>>('/health')).data.data,
    retry: false,
  });

  if (isLoading) return <Tag>API 检查中</Tag>;
  if (isError) return <Tag color="error">API 未连接</Tag>;
  return <Tag color="success">API {data?.status ?? '未知'}</Tag>;
}

function LoginPage() {
  const login = useAuthStore((state) => state.login);
  const [form] = Form.useForm();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (values: { tenantCode: string; email: string; password: string }) => {
    setSubmitting(true);
    setError(null);
    try {
      await login(values);
    } catch (cause) {
      const message = (cause as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message;
      setError(message ?? '登录失败，请检查商户编码、邮箱和密码');
    } finally {
      setSubmitting(false);
    }
  };

  return <div className="login-page">
    <Card className="login-card">
      <Typography.Title level={2}>登录 BorderFlow</Typography.Title>
      <Typography.Paragraph type="secondary">请输入你的商户和账号信息</Typography.Paragraph>
      {error && <Alert type="error" showIcon message={error} className="login-error" />}
      <Form form={form} layout="vertical" onFinish={submit} initialValues={{ tenantCode: 'demo-shop' }}>
        <Form.Item label="商户编码" name="tenantCode" rules={[{ required: true, message: '请输入商户编码' }]}><Input placeholder="例如 demo-shop" /></Form.Item>
        <Form.Item label="邮箱" name="email" rules={[{ required: true, type: 'email', message: '请输入正确的邮箱' }]}><Input autoComplete="email" /></Form.Item>
        <Form.Item label="密码" name="password" rules={[{ required: true, message: '请输入密码' }]}><Input.Password autoComplete="current-password" /></Form.Item>
        <Button type="primary" htmlType="submit" block loading={submitting}>登录</Button>
      </Form>
    </Card>
  </div>;
}

function Home() {
  return (
    <div className="welcome-card">
      <Typography.Title level={2}>欢迎来到 BorderFlow</Typography.Title>
      <Typography.Paragraph>
        跨境商家运营工作台初始化完成。下一步将接入登录、商品、订单、库存和 AI Agent 垂直切片。
      </Typography.Paragraph>
      <HealthBadge />
    </div>
  );
}

function Placeholder({ name }: { name: string }) {
  return <div className="welcome-card"><Typography.Title level={3}>{name}</Typography.Title><Typography.Text type="secondary">模块骨架已就绪，等待对应开发切片。</Typography.Text></div>;
}

export default function App() {
  const { status, user, bootstrap, logout } = useAuthStore();
  const bootstrapStarted = useRef(false);
  useEffect(() => {
    if (bootstrapStarted.current) return;
    bootstrapStarted.current = true;
    void bootstrap();
  }, [bootstrap]);

  if (status === 'loading') return <div className="auth-loading"><Spin size="large" /></div>;
  if (status === 'unauthenticated') return <LoginPage />;

  return (
    <Layout className="app-shell">
      <Sider breakpoint="lg" collapsedWidth="0" theme="light">
        <div className="brand">BorderFlow</div>
        <nav className="nav">
          <Link to="/">总览</Link>
          <Link to="/products">商品与 SKU</Link>
          <Link to="/orders">订单与履约</Link>
          <Link to="/inventory">库存</Link>
          <Link to="/integrations/shopify">Shopify-ready</Link>
        </nav>
      </Sider>
      <Layout>
        <Header className="topbar"><Typography.Text strong>跨境商家运营工作台</Typography.Text><div className="topbar-actions"><HealthBadge /><Typography.Text>{user?.name}</Typography.Text><Button type="link" onClick={() => void logout()}>退出登录</Button></div></Header>
        <Content className="content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/integrations/shopify" element={<Placeholder name="Shopify-ready 集成" />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}
