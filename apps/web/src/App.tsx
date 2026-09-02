import { Alert, Avatar, Badge, Button, Card, Divider, Form, Input, Layout, Spin, Tag, Typography } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useAuthStore } from './auth';
import { ApiSuccess } from '@borderflow/shared';
import ProductsPage from './ProductsPage';
import OrdersPage from './OrdersPage';
import InventoryPage from './InventoryPage';
import ProductDetailPage from './ProductDetailPage';
import AuditLogsPage from './AuditLogsPage';
import StoresPage from './StoresPage';
import ShopifyPage from './ShopifyPage';

const { Header, Content, Sider } = Layout;

const navItems = [
  { to: '/', label: '运营总览', short: '总览', glyph: '⌂' },
  { to: '/products', label: '商品与 SKU', short: '商品', glyph: '◈' },
  { to: '/orders', label: '订单与履约', short: '订单', glyph: '▤' },
  { to: '/inventory', label: '库存管理', short: '库存', glyph: '▦' },
  { to: '/stores', label: '店铺与仓库', short: '店铺', glyph: '⌂' },
  { to: '/audit-logs', label: '审计日志', short: '日志', glyph: '◷' },
];

const pageMeta: Record<string, { eyebrow: string; title: string }> = {
  '/': { eyebrow: 'WORKSPACE / OVERVIEW', title: '运营总览' },
  '/products': { eyebrow: 'CATALOG / PRODUCTS', title: '商品与 SKU' },
  '/orders': { eyebrow: 'COMMERCE / FULFILLMENT', title: '订单与履约' },
  '/inventory': { eyebrow: 'OPERATIONS / INVENTORY', title: '库存管理' },
  '/stores': { eyebrow: 'OPERATIONS / STORES', title: '店铺与仓库' },
  '/audit-logs': { eyebrow: 'SECURITY / AUDIT', title: '审计日志' },
  '/integrations/shopify': { eyebrow: 'CHANNELS / INTEGRATIONS', title: 'Shopify 集成' },
};
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
    <div className="login-showcase">
      <div className="showcase-orb orb-one" />
      <div className="showcase-orb orb-two" />
      <div className="showcase-content">
        <div className="brand brand-light"><span className="brand-mark">B</span> BorderFlow</div>
        <div className="showcase-copy">
          <span className="eyebrow light">CROSS-BORDER COMMERCE OS</span>
          <Typography.Title>把全球生意，<br /><span>装进一个工作台。</span></Typography.Title>
          <Typography.Paragraph>从商品、订单到库存，让每一次跨境履约都清晰、可控、可增长。</Typography.Paragraph>
        </div>
        <div className="showcase-metrics"><span><strong>28+</strong><small>覆盖市场</small></span><span><strong>99.8%</strong><small>履约准时率</small></span><span><strong>24/7</strong><small>实时同步</small></span></div>
      </div>
    </div>
    <Card className="login-card">
      <div className="login-header"><span className="eyebrow">WELCOME BACK</span><Typography.Title level={2}>登录 BorderFlow</Typography.Title><Typography.Paragraph type="secondary">进入你的跨境运营空间</Typography.Paragraph></div>
      {error && <Alert type="error" showIcon message={error} className="login-error" />}
      <Form form={form} layout="vertical" onFinish={submit} initialValues={{ tenantCode: 'demo-shop' }}>
        <Form.Item label="商户编码" name="tenantCode" rules={[{ required: true, message: '请输入商户编码' }]}><Input placeholder="例如 demo-shop" /></Form.Item>
        <Form.Item label="邮箱" name="email" rules={[{ required: true, type: 'email', message: '请输入正确的邮箱' }]}><Input autoComplete="email" /></Form.Item>
        <Form.Item label="密码" name="password" rules={[{ required: true, message: '请输入密码' }]}><Input.Password autoComplete="current-password" /></Form.Item>
        <Button className="login-submit" type="primary" htmlType="submit" block loading={submitting}>登录工作台 <span>→</span></Button>
      </Form>
      <div className="login-footer"><span className="secure-dot" /> 企业级加密连接 <span className="footer-separator">·</span> <a href="mailto:support@borderflow.local">需要帮助？</a></div>
    </Card>
  </div>;
}

interface DashboardSummary {
  asOf: string;
  sales: { current: string; previous: string; changePct: number | null; currency: string };
  pendingOrders: number;
  inventoryHealth: { healthySkus: number; totalSkus: number; lowStockSkus: number; unconfiguredSkus: number; percentage: number };
  activeChannels: number;
  salesTrend: { date: string; amount: string; orders: number }[];
  marketPerformance: { market: string; amount: string; currency: string; orders: number; channelType: string }[];
  recentActivities: { id: string; action: string; resource: string; resourceId?: string; title: string; description: string; createdAt: string }[];
}

function Home() {
  const dashboard = useQuery({ queryKey: ['dashboard-summary'], queryFn: async () => (await api.get<ApiSuccess<DashboardSummary>>('/dashboard/summary')).data.data, refetchInterval: 60_000 });
  const summary = dashboard.data;
  const trend = summary?.salesTrend ?? [];
  const trendMax = Math.max(...trend.map((item) => Number(item.amount)), 1);
  const marketMax = Math.max(...(summary?.marketPerformance ?? []).map((item) => Number(item.amount)), 1);
  const formatMoney = (amount: string | number, currency = summary?.sales.currency ?? 'USD') => `${currency === 'USD' ? '$' : `${currency} `}${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return (
    <div className="dashboard-page">
      <section className="dashboard-hero">
        <div><span className="eyebrow">TUESDAY, 01 SEP 2026</span><Typography.Title>早上好，今天也要高效出海。</Typography.Title><Typography.Paragraph>这是你的全球业务快照，所有关键动作都在这里。</Typography.Paragraph></div>
        <Button className="hero-action" type="primary">创建销售订单 <span>＋</span></Button>
      </section>
      <section className="metric-grid">
        <Card className="metric-card accent-blue"><div className="metric-top"><span>本月销售额</span><span className="metric-icon">↗</span></div><strong>{summary ? formatMoney(summary.sales.current) : '—'}</strong><div className="metric-trend positive">{summary?.sales.changePct === null || summary?.sales.changePct === undefined ? '—' : `${summary.sales.changePct >= 0 ? '↑' : '↓'} ${Math.abs(summary.sales.changePct)}%`} <span>较上月</span></div><div className="mini-bars">{(trend.slice(-7).length ? trend.slice(-7) : Array.from({ length: 7 }, () => ({ amount: '0' }))).map((item, index) => <i key={`${item.amount}-${index}`} style={{ height: `${Math.max(Number(item.amount) / trendMax * 100, 4)}%` }} />)}</div></Card>
        <Card className="metric-card accent-mint"><div className="metric-top"><span>待处理订单</span><span className="metric-icon">◷</span></div><strong>{summary?.pendingOrders ?? '—'}</strong><div className="metric-trend neutral">当前待处理 <span>含待付款、拣货和发货</span></div><div className="metric-progress"><span style={{ width: `${summary ? Math.min(summary.pendingOrders / Math.max(summary.pendingOrders + 10, 1) * 100, 100) : 0}%` }} /></div><small>数据每分钟自动刷新</small></Card>
        <Card className="metric-card accent-amber"><div className="metric-top"><span>库存健康度</span><span className="metric-icon">▦</span></div><strong>{summary ? `${summary.inventoryHealth.percentage}%` : '—'}</strong><div className="metric-trend neutral">{summary ? `${summary.inventoryHealth.lowStockSkus + summary.inventoryHealth.unconfiguredSkus} 个 SKU 需关注` : '统计中'} <span>基于 {summary?.inventoryHealth.totalSkus ?? '—'} 个 SKU</span></div><div className="health-ring"><span>{summary?.inventoryHealth.percentage ?? '—'}</span></div></Card>
        <Card className="metric-card accent-violet"><div className="metric-top"><span>活跃销售渠道</span><span className="metric-icon">⌁</span></div><strong>{summary ? String(summary.activeChannels).padStart(2, '0') : '—'}</strong><div className="metric-trend neutral">已连接渠道 <span>来自真实连接状态</span></div><div className="channel-dots"><i>SH</i><i>AM</i><i>SL</i></div></Card>
      </section>
      <section className="dashboard-columns">
        <Card className="panel-card chart-card"><div className="panel-heading"><div><Typography.Title level={4}>销售趋势</Typography.Title><Typography.Text type="secondary">最近 30 天 · 来自订单数据</Typography.Text></div><div className="chart-legend"><span><i className="legend-dot sales" />销售额</span><span><i className="legend-dot orders" />订单数</span></div></div><div className="chart-area"><div className="chart-y"><span>{formatMoney(trendMax)}</span><span>{formatMoney(trendMax * .66)}</span><span>{formatMoney(trendMax * .33)}</span><span>$0</span></div><div className="chart-lines"><div className="grid-line"/><div className="grid-line"/><div className="grid-line"/><div className="grid-line"/><div className="dashboard-trend-bars">{trend.slice(-14).map((item) => <div className="dashboard-trend-bar" key={item.date} title={`${item.date} · ${formatMoney(item.amount)} · ${item.orders} 单`}><i style={{ height: `${Math.max(Number(item.amount) / trendMax * 100, 3)}%` }} /></div>)}</div><div className="chart-x">{trend.slice(-5).map((item) => <span key={item.date}>{item.date.slice(5)}</span>)}</div></div></div></Card>
        <Card className="panel-card activity-card"><div className="panel-heading"><div><Typography.Title level={4}>待办与动态</Typography.Title><Typography.Text type="secondary">最近业务动作</Typography.Text></div><Badge count={summary?.recentActivities.length ?? 0} /></div><div className="activity-list">{(summary?.recentActivities ?? []).slice(0, 4).map((activity, index) => <div className="activity-item" key={activity.id}><span className={`activity-bullet ${index === 0 ? 'info' : index === 1 ? 'success' : 'neutral'}`}>{index === 0 ? '↗' : index === 1 ? '✓' : '⋯'}</span><div><strong>{activity.title}</strong><p>{activity.description} · {new Date(activity.createdAt).toLocaleString()}</p></div><span className="activity-arrow">→</span></div>)}{!summary?.recentActivities.length && <Typography.Text type="secondary">暂无业务动态</Typography.Text>}</div></Card>
      </section>
      <section className="dashboard-columns bottom-panels"><Card className="panel-card market-card"><div className="panel-heading"><div><Typography.Title level={4}>市场表现</Typography.Title><Typography.Text type="secondary">本月按地区查看销售贡献</Typography.Text></div><Button type="link" onClick={() => window.location.href = '/orders'}>查看订单 →</Button></div><div className="market-rows">{(summary?.marketPerformance ?? []).slice(0, 5).map((market) => <div className="market-row" key={market.market}><span className="country-flag">🌐</span><div className="market-name"><strong>{market.market}</strong><small>{market.channelType} · {market.orders} 单</small></div><div className="market-bar"><i style={{ width: `${Math.max(Number(market.amount) / marketMax * 100, 4)}%` }} /></div><strong>{formatMoney(market.amount, market.currency)}</strong><span className="market-up">—</span></div>)}{!summary?.marketPerformance.length && <Typography.Text type="secondary">本月暂无销售数据</Typography.Text>}</div></Card><Card className="panel-card quick-card"><div className="panel-heading"><div><Typography.Title level={4}>快捷入口</Typography.Title><Typography.Text type="secondary">常用操作</Typography.Text></div></div><div className="quick-grid"><Link to="/products"><span>◈</span><strong>管理商品</strong><small>查看商品与 SKU</small></Link><Link to="/orders"><span>▤</span><strong>处理订单</strong><small>{summary?.pendingOrders ?? '—'} 个待处理</small></Link><Link to="/inventory"><span>▦</span><strong>查看库存</strong><small>{summary?.inventoryHealth.lowStockSkus ?? '—'} 个低库存 SKU</small></Link><Link to="/integrations/shopify"><span>⌁</span><strong>连接渠道</strong><small>{summary?.activeChannels ?? '—'} 个活跃渠道</small></Link></div></Card></section>
      <div className="dashboard-footnote"><HealthBadge /><span>数据每 5 分钟自动更新</span></div>
    </div>
  );
}

function Placeholder({ name }: { name: string }) {
  return <div className="welcome-card"><Typography.Title level={3}>{name}</Typography.Title><Typography.Text type="secondary">模块骨架已就绪，等待对应开发切片。</Typography.Text></div>;
}

export default function App() {
  const { status, user, bootstrap, logout } = useAuthStore();
  const bootstrapStarted = useRef(false);
  const location = useLocation();
  const currentMeta = useMemo(() => pageMeta[location.pathname] ?? pageMeta['/'], [location.pathname]);
  const [siderCollapsed, setSiderCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  useEffect(() => {
    if (bootstrapStarted.current) return;
    bootstrapStarted.current = true;
    void bootstrap();
  }, [bootstrap]);

  if (status === 'loading') return <div className="auth-loading"><Spin size="large" /></div>;
  if (status === 'unauthenticated') return <LoginPage />;

  return (
    <Layout className="app-shell">
      <Sider breakpoint="md" collapsedWidth="0" theme="light" className="app-sider" collapsed={isMobile ? !mobileNavOpen : siderCollapsed} onCollapse={(collapsed) => { setSiderCollapsed(collapsed); if (isMobile) setMobileNavOpen(!collapsed); }} onBreakpoint={(broken) => { setIsMobile(broken); if (broken) setMobileNavOpen(false); }}>
        <div className="brand"><span className="brand-mark">B</span><span>Border<span className="brand-accent">Flow</span></span></div>
        <div className="workspace-switcher"><span className="workspace-logo">DS</span><span><strong>{user?.tenant.name ?? 'Demo Store'}</strong><small>商家工作空间</small></span><span className="switcher-chevron">⌄</span></div>
        <nav className="nav"><span className="nav-label">工作台</span>{navItems.filter((item) => item.to !== '/audit-logs' || user?.role === 'ADMIN' || user?.role === 'ANALYST').map((item) => <NavLink key={item.to} to={item.to} end={item.to === '/'} onClick={() => isMobile && setMobileNavOpen(false)}><span className="nav-glyph">{item.glyph}</span>{item.label}</NavLink>)}<span className="nav-label nav-label-spaced">渠道与设置</span><NavLink to="/integrations/shopify" onClick={() => isMobile && setMobileNavOpen(false)}><span className="nav-glyph">⌁</span>销售渠道<span className="nav-badge">4</span></NavLink><a href="#settings"><span className="nav-glyph">⚙</span>偏好设置</a></nav>
        <div className="sider-bottom"><div className="help-card"><span className="help-icon">?</span><div><strong>需要帮助？</strong><small>查看帮助中心</small></div><span>→</span></div><div className="sider-user"><Avatar size={32} style={{background:'#e4e1ff', color:'#5b52d9'}}>{(user?.name ?? 'U').slice(0,1).toUpperCase()}</Avatar><div><strong>{user?.name ?? 'Operator'}</strong><small>{user?.role === 'ADMIN' ? '管理员' : '运营成员'}</small></div><Button type="text" aria-label="退出登录" onClick={() => void logout()}>⋯</Button></div></div>
      </Sider>
      {isMobile && mobileNavOpen && <div className="mobile-nav-scrim" aria-hidden="true" onClick={() => setMobileNavOpen(false)} />}
      <Layout>
        <Header className="topbar"><div className="topbar-heading"><Button className="mobile-menu-button" type="text" aria-label="打开导航" onClick={() => setMobileNavOpen((open) => !open)}>☰</Button><div className="topbar-title"><span className="eyebrow">{currentMeta.eyebrow}</span><Typography.Text strong>{currentMeta.title}</Typography.Text></div></div><div className="topbar-actions"><div className="topbar-date">最后同步 09:42 <span className="sync-dot" /></div><Button className="icon-button" type="text" aria-label="通知"><Badge dot><span>♢</span></Badge></Button><Divider type="vertical" /><div className="topbar-user"><Avatar size={34} style={{background:'#e4e1ff', color:'#5b52d9'}}>{(user?.name ?? 'U').slice(0,1).toUpperCase()}</Avatar><span>{user?.name}</span><span className="user-chevron">⌄</span></div></div></Header>
        <Content className="content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/products/:id" element={<ProductDetailPage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/audit-logs" element={<AuditLogsPage />} />
            <Route path="/stores" element={<StoresPage />} />
            <Route path="/integrations/shopify" element={<ShopifyPage />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}
