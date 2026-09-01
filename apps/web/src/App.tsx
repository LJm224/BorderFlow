import { Layout, Tag, Typography } from 'antd';
import { Link, Route, Routes } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { ApiSuccess } from '@borderflow/shared';

const { Header, Content, Sider } = Layout;
const configuredApiUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');
const API_BASE_URL = configuredApiUrl.endsWith('/api') ? configuredApiUrl : `${configuredApiUrl}/api`;

function HealthBadge() {
  const { data, isError, isLoading } = useQuery({
    queryKey: ['health'],
    queryFn: async () => (await axios.get<ApiSuccess<{ status: string }>>(`${API_BASE_URL}/health`)).data.data,
    retry: false,
  });

  if (isLoading) return <Tag>API 检查中</Tag>;
  if (isError) return <Tag color="error">API 未连接</Tag>;
  return <Tag color="success">API {data?.status ?? '未知'}</Tag>;
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
        <Header className="topbar"><Typography.Text strong>跨境商家运营工作台</Typography.Text><HealthBadge /></Header>
        <Content className="content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/products" element={<Placeholder name="商品与 SKU" />} />
            <Route path="/orders" element={<Placeholder name="订单与履约" />} />
            <Route path="/inventory" element={<Placeholder name="库存" />} />
            <Route path="/integrations/shopify" element={<Placeholder name="Shopify-ready 集成" />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}
