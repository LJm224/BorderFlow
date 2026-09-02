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

function Home() {
  return (
    <div className="dashboard-page">
      <section className="dashboard-hero">
        <div><span className="eyebrow">TUESDAY, 01 SEP 2026</span><Typography.Title>早上好，今天也要高效出海。</Typography.Title><Typography.Paragraph>这是你的全球业务快照，所有关键动作都在这里。</Typography.Paragraph></div>
        <Button className="hero-action" type="primary">创建销售订单 <span>＋</span></Button>
      </section>
      <section className="metric-grid">
        <Card className="metric-card accent-blue"><div className="metric-top"><span>本月销售额</span><span className="metric-icon">↗</span></div><strong>$128,430.00</strong><div className="metric-trend positive">↑ 12.8% <span>较上月</span></div><div className="mini-bars"><i style={{height:'38%'}}/><i style={{height:'52%'}}/><i style={{height:'46%'}}/><i style={{height:'68%'}}/><i style={{height:'60%'}}/><i style={{height:'82%'}}/><i style={{height:'100%'}}/></div></Card>
        <Card className="metric-card accent-mint"><div className="metric-top"><span>待处理订单</span><span className="metric-icon">◷</span></div><strong>286</strong><div className="metric-trend positive">↑ 8.2% <span>较昨日</span></div><div className="metric-progress"><span style={{width:'72%'}}/></div><small>72% 已在 24 小时内处理</small></Card>
        <Card className="metric-card accent-amber"><div className="metric-top"><span>库存健康度</span><span className="metric-icon">▦</span></div><strong>92.4%</strong><div className="metric-trend neutral">稳定 <span>基于 1,248 个 SKU</span></div><div className="health-ring"><span>92</span></div></Card>
        <Card className="metric-card accent-violet"><div className="metric-top"><span>活跃销售渠道</span><span className="metric-icon">⌁</span></div><strong>04</strong><div className="metric-trend positive">+ 1 <span>本月新增</span></div><div className="channel-dots"><i>AM</i><i>SH</i><i>TT</i><i>✚</i></div></Card>
      </section>
      <section className="dashboard-columns">
        <Card className="panel-card chart-card"><div className="panel-heading"><div><Typography.Title level={4}>销售趋势</Typography.Title><Typography.Text type="secondary">过去 30 天 · 全部渠道</Typography.Text></div><div className="chart-legend"><span><i className="legend-dot sales" />销售额</span><span><i className="legend-dot orders" />订单数</span><Button type="text">30 天⌄</Button></div></div><div className="chart-area"><div className="chart-y"><span>$150k</span><span>$100k</span><span>$50k</span><span>$0</span></div><div className="chart-lines"><div className="grid-line"/><div className="grid-line"/><div className="grid-line"/><div className="grid-line"/><svg viewBox="0 0 600 180" preserveAspectRatio="none" role="img" aria-label="销售额趋势图"><defs><linearGradient id="salesFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#6c63ff" stopOpacity=".24"/><stop offset="100%" stopColor="#6c63ff" stopOpacity="0"/></linearGradient></defs><path d="M0 142 C30 130 44 142 65 128 S100 110 120 124 S155 94 180 102 S215 64 240 82 S275 70 300 76 S335 55 360 62 S390 22 420 48 S460 36 480 40 S520 16 540 28 S570 18 600 4 L600 180 L0 180 Z" fill="url(#salesFill)"/><path d="M0 142 C30 130 44 142 65 128 S100 110 120 124 S155 94 180 102 S215 64 240 82 S275 70 300 76 S335 55 360 62 S390 22 420 48 S460 36 480 40 S520 16 540 28 S570 18 600 4" fill="none" stroke="#6c63ff" strokeWidth="3" strokeLinecap="round"/><path d="M0 158 C40 150 60 164 90 150 S150 134 180 145 S230 132 260 143 S310 110 350 126 S420 96 450 113 S500 88 540 102 S570 88 600 96" fill="none" stroke="#99a3b8" strokeWidth="2" strokeDasharray="5 5"/></svg><div className="chart-x"><span>8/03</span><span>8/10</span><span>8/17</span><span>8/24</span><span>8/31</span></div></div></div></Card>
        <Card className="panel-card activity-card"><div className="panel-heading"><div><Typography.Title level={4}>待办与动态</Typography.Title><Typography.Text type="secondary">需要你关注的事项</Typography.Text></div><Badge count={3} /></div><div className="activity-list"><div className="activity-item"><span className="activity-bullet warning">!</span><div><strong>3 个 SKU 库存不足</strong><p>US 仓 · 最后更新 12 分钟前</p></div><span className="activity-arrow">→</span></div><div className="activity-item"><span className="activity-bullet success">✓</span><div><strong>Shopify 已完成同步</strong><p>1,248 个商品 · 35 分钟前</p></div><span className="activity-arrow">→</span></div><div className="activity-item"><span className="activity-bullet info">↗</span><div><strong>本周销售额突破 $30k</strong><p>较上周增长 18.6%</p></div><span className="activity-arrow">→</span></div><div className="activity-item"><span className="activity-bullet neutral">⋯</span><div><strong>查看全部动态</strong><p>共 12 条未读消息</p></div><span className="activity-arrow">→</span></div></div></Card>
      </section>
      <section className="dashboard-columns bottom-panels"><Card className="panel-card market-card"><div className="panel-heading"><div><Typography.Title level={4}>市场表现</Typography.Title><Typography.Text type="secondary">按地区查看销售贡献</Typography.Text></div><Button type="link">查看报告 →</Button></div><div className="market-rows"><div className="market-row"><span className="country-flag">🇺🇸</span><div className="market-name"><strong>美国</strong><small>US · Shopify</small></div><div className="market-bar"><i style={{width:'78%'}}/></div><strong>$52,480</strong><span className="market-up">+24%</span></div><div className="market-row"><span className="country-flag">🇬🇧</span><div className="market-name"><strong>英国</strong><small>UK · Amazon</small></div><div className="market-bar"><i style={{width:'56%'}}/></div><strong>$31,220</strong><span className="market-up">+16%</span></div><div className="market-row"><span className="country-flag">🇩🇪</span><div className="market-name"><strong>德国</strong><small>DE · Shopify</small></div><div className="market-bar"><i style={{width:'42%'}}/></div><strong>$24,890</strong><span className="market-up">+11%</span></div></div></Card><Card className="panel-card quick-card"><div className="panel-heading"><div><Typography.Title level={4}>快捷入口</Typography.Title><Typography.Text type="secondary">常用操作</Typography.Text></div></div><div className="quick-grid"><Link to="/products"><span>◈</span><strong>管理商品</strong><small>1,248 个商品</small></Link><Link to="/orders"><span>▤</span><strong>处理订单</strong><small>286 个待处理</small></Link><Link to="/inventory"><span>▦</span><strong>查看库存</strong><small>3 个库存预警</small></Link><Link to="/integrations/shopify"><span>⌁</span><strong>连接渠道</strong><small>4 个活跃渠道</small></Link></div></Card></section>
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
