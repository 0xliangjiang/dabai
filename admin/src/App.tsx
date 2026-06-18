import {
  AlertTriangle,
  ArrowDownToLine,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Copy,
  LayoutDashboard,
  LogOut,
  Megaphone,
  PackageSearch,
  RefreshCw,
  RotateCcw,
  Settings,
  ShieldQuestion,
  Users,
  WalletCards,
  XCircle
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./components/ui/table";
import { Toaster } from "./components/ui/toaster";
import { DealManager } from "./DealManager";
import {
  apiBaseUrl,
  fetchAdminApi,
  mediaUrl,
  type AdminClaim,
  type AdminConfig,
  type AdminOrder,
  type AdminOverview,
  type AdminSetting,
  type AdminUser,
  type AdminWithdrawal,
  type Downline,
  type PendingAttribution,
  type SyncStatus
} from "./lib/api";
import { toast } from "./lib/toast";

type AdminData = {
  overview: AdminOverview;
  users: AdminUser[];
  config: AdminConfig["config"];
  pendingAttributions: PendingAttribution[];
  claims: AdminClaim[];
  withdrawals: AdminWithdrawal[];
};

const emptyData: AdminData = {
  overview: {
    metrics: {
      userCount: 0,
      conversionCount: 0,
      copyEventCount: 0,
      pendingAttributionCount: 0,
      orderClaimCount: 0
    }
  },
  users: [],
  config: {
    zhetaokePid: "",
    commissionSharingRatio: 0,
    attributionWindowHours: 24,
    highValueReviewThresholdCents: 5000,
    exchangeEnabled: false,
    referralCommissionRatio: 0.2,
    referralEnabled: false
  },
  pendingAttributions: [],
  claims: [],
  withdrawals: []
};

const NAV_ITEMS = [
  { id: "overview", label: "概览", icon: LayoutDashboard },
  { id: "deals", label: "线报管理", icon: Megaphone },
  { id: "users", label: "用户", icon: Users },
  { id: "all-orders", label: "全部订单", icon: PackageSearch },
  { id: "attribution", label: "待复核", icon: ClipboardCheck },
  { id: "claims", label: "申诉审核", icon: ShieldQuestion },
  { id: "withdrawals", label: "提现审核", icon: ArrowDownToLine },
  { id: "settings", label: "运营设置", icon: Settings },
  { id: "config", label: "配置", icon: Settings }
];

export function App() {
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem("dabai-admin-token") ?? "");
  const [tokenInput, setTokenInput] = useState("");
  const [authed, setAuthed] = useState(false);
  const [data, setData] = useState<AdminData>(emptyData);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [activeNav, setActiveNav] = useState("overview");
  const [orders, setOrders] = useState<{ total: number; items: AdminOrder[] }>({ total: 0, items: [] });
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [markingOrderId, setMarkingOrderId] = useState("");
  const [pointsModal, setPointsModal] = useState<{ userId: string; nickname: string } | null>(null);
  const [pointsDelta, setPointsDelta] = useState("");
  const [ratioModal, setRatioModal] = useState<{ userId: string; nickname: string } | null>(null);
  const [ratioInput, setRatioInput] = useState("");
  const [downlineModal, setDownlineModal] = useState<{ nickname: string } | null>(null);
  const [downlines, setDownlines] = useState<Downline[]>([]);
  const [downlineLoading, setDownlineLoading] = useState(false);
  const [globalRatioInput, setGlobalRatioInput] = useState("");
  const [savingGlobalRatio, setSavingGlobalRatio] = useState(false);
  const [referralRatioInput, setReferralRatioInput] = useState("");
  const [savingReferralRatio, setSavingReferralRatio] = useState(false);
  const [settings, setSettings] = useState<AdminSetting[]>([]);
  const [settingDrafts, setSettingDrafts] = useState<Record<string, string>>({});
  const [savingSettings, setSavingSettings] = useState(false);

  const configItems = useMemo(
    () => [
      ["淘宝推广位 PID", data.config.zhetaokePid || "未配置"],
      ["自动归因窗口", `复制后 ${data.config.attributionWindowHours} 小时`],
      ["高额复核阈值", formatMoney(data.config.highValueReviewThresholdCents)],
      ["API 地址", apiBaseUrl]
    ],
    [data]
  );

  useEffect(() => {
    setGlobalRatioInput(String(Math.round(data.config.commissionSharingRatio * 100)));
  }, [data.config.commissionSharingRatio]);

  useEffect(() => {
    setReferralRatioInput(String(Math.round((data.config.referralCommissionRatio ?? 0) * 100)));
  }, [data.config.referralCommissionRatio]);

  async function loadData(token = adminToken, options: { silent?: boolean } = {}) {
    if (!token.trim()) return false;

    setLoading(true);
    try {
      const [overview, usersResponse, configResponse, pendingResponse, claimsResponse, withdrawalsResponse] = await Promise.all([
        fetchAdminApi<AdminOverview>("/api/admin/overview", token),
        fetchAdminApi<{ users: AdminUser[] }>("/api/admin/users", token),
        fetchAdminApi<AdminConfig>("/api/admin/config", token),
        fetchAdminApi<{ items: PendingAttribution[] }>("/api/admin/pending-attributions", token),
        fetchAdminApi<{ claims: AdminClaim[] }>("/api/admin/claims", token),
        fetchAdminApi<{ withdrawals: AdminWithdrawal[] }>("/api/admin/withdrawals", token)
      ]);
      setData({
        overview,
        users: usersResponse.users,
        config: configResponse.config,
        pendingAttributions: pendingResponse.items,
        claims: claimsResponse.claims,
        withdrawals: withdrawalsResponse.withdrawals
      });
      localStorage.setItem("dabai-admin-token", token);
      setAdminToken(token);
      setAuthed(true);
      if (!options.silent) toast("数据已刷新");
      void fetchAdminApi<{ total: number; items: AdminOrder[] }>("/api/admin/orders?page=1&pageSize=50", token)
        .then((r) => { setOrders(r); setOrdersPage(1); })
        .catch(() => null);
      void fetchAdminApi<SyncStatus>("/api/admin/sync-status", token)
        .then(setSyncStatus)
        .catch(() => null);
      void fetchAdminApi<{ settings: AdminSetting[] }>("/api/admin/settings", token)
        .then(({ settings: rows }) => {
          setSettings(rows);
          const drafts: Record<string, string> = {};
          for (const s of rows) drafts[s.key] = s.secret ? "" : s.value;
          setSettingDrafts(drafts);
        })
        .catch(() => null);
      return true;
    } catch (_error) {
      if (authed) {
        toast("加载失败，请检查网络或 Token", "error");
      }
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function markOrderStatus(orderId: string, status: "received" | "settled") {
    const label = status === "received" ? "已收货" : "已结算";
    if (status === "settled" && !window.confirm("标记已结算会把佣金积分发放到归属用户，确定吗？")) return;
    setMarkingOrderId(orderId);
    try {
      await fetchAdminApi(`/api/admin/orders/${orderId}/status`, adminToken, {
        method: "POST",
        body: JSON.stringify({ status })
      });
      toast(`已标记为${label}`);
      await loadOrders(ordersPage);
    } catch {
      toast("标记失败，请重试", "error");
    } finally {
      setMarkingOrderId("");
    }
  }

  async function loadOrders(page = ordersPage) {
    setOrdersLoading(true);
    try {
      const result = await fetchAdminApi<{ total: number; items: AdminOrder[] }>(
        `/api/admin/orders?page=${page}&pageSize=50`,
        adminToken
      );
      setOrders(result);
      setOrdersPage(page);
    } catch {
      toast("订单加载失败", "error");
    } finally {
      setOrdersLoading(false);
    }
  }

  async function login() {
    const ok = await loadData(tokenInput.trim(), { silent: true });
    if (ok) {
      toast("登录成功");
    } else {
      toast("Token 无效或服务不可达", "error");
    }
  }

  function logout() {
    localStorage.removeItem("dabai-admin-token");
    setAdminToken("");
    setTokenInput("");
    setAuthed(false);
    setData(emptyData);
  }

  async function approveAttribution(id: string, userId: string | null) {
    await fetchAdminApi(`/api/admin/orders/${id}/attribute`, adminToken, {
      method: "POST",
      body: JSON.stringify({ userId })
    });
    toast("已通过归因");
    await loadData(adminToken, { silent: true });
  }

  async function setUserStatus(id: string, status: "active" | "banned") {
    await fetchAdminApi(`/api/admin/users/${id}/status`, adminToken, {
      method: "POST",
      body: JSON.stringify({ status })
    });
    toast(status === "banned" ? "已封禁该用户" : "已解封该用户");
    await loadData(adminToken, { silent: true });
  }

  async function reviewWithdrawal(id: string, status: "paid" | "rejected") {
    await fetchAdminApi(`/api/admin/withdrawals/${id}/review`, adminToken, {
      method: "POST",
      body: JSON.stringify({ status })
    });
    toast(status === "paid" ? "已标记为已打款" : "已驳回提现申请");
    await loadData(adminToken, { silent: true });
  }

  async function deleteUser(id: string, nickname: string) {
    if (!window.confirm(`确定删除用户「${nickname}」的所有数据？此操作不可恢复。`)) return;
    await fetchAdminApi(`/api/admin/users/${id}`, adminToken, { method: "DELETE" });
    toast("用户数据已删除");
    await loadData(adminToken, { silent: true });
  }

  async function submitAdjustPoints() {
    if (!pointsModal) return;
    const delta = parseInt(pointsDelta, 10);
    if (!delta || isNaN(delta)) { toast("请输入有效的积分数量", "error"); return; }
    await fetchAdminApi(`/api/admin/users/${pointsModal.userId}/adjust-points`, adminToken, {
      method: "POST",
      body: JSON.stringify({ delta, reason: "admin_manual" })
    });
    toast(`已为「${pointsModal.nickname}」${delta > 0 ? "增加" : "扣除"} ${Math.abs(delta)} 积分`);
    setPointsModal(null);
    setPointsDelta("");
  }

  async function loadSettings() {
    try {
      const { settings: rows } = await fetchAdminApi<{ settings: AdminSetting[] }>("/api/admin/settings", adminToken);
      setSettings(rows);
      const drafts: Record<string, string> = {};
      for (const s of rows) drafts[s.key] = s.secret ? "" : s.value;
      setSettingDrafts(drafts);
    } catch {
      toast("运营设置加载失败", "error");
    }
  }

  async function saveSettings() {
    const entries = settings
      .map((s) => ({ key: s.key, value: settingDrafts[s.key] ?? "" }))
      // 密钥留空表示不修改，前端就不提交
      .filter((e) => {
        const meta = settings.find((s) => s.key === e.key);
        return !(meta?.secret && e.value.trim() === "");
      });
    setSavingSettings(true);
    try {
      await fetchAdminApi("/api/admin/settings", adminToken, {
        method: "POST",
        body: JSON.stringify({ entries })
      });
      toast("运营设置已保存，即时生效");
      await loadSettings();
    } catch {
      toast("保存失败，请重试", "error");
    } finally {
      setSavingSettings(false);
    }
  }

  async function saveGlobalRatio() {
    const pct = parseFloat(globalRatioInput);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      toast("请输入 0~100 的百分比", "error");
      return;
    }
    setSavingGlobalRatio(true);
    try {
      await fetchAdminApi("/api/admin/config/commission-ratio", adminToken, {
        method: "POST",
        body: JSON.stringify({ commissionSharingRatio: pct / 100 })
      });
      toast(`全局返利比例已设为 ${pct}%`);
      await loadData(adminToken, { silent: true });
    } catch {
      toast("保存失败，请重试", "error");
    } finally {
      setSavingGlobalRatio(false);
    }
  }

  async function toggleExchange(enabled: boolean) {
    try {
      await fetchAdminApi("/api/admin/config/exchange-enabled", adminToken, {
        method: "POST",
        body: JSON.stringify({ enabled })
      });
      toast(enabled ? "已开启兑换功能（小程序显示入口）" : "已关闭兑换功能（小程序隐藏入口）");
      await loadData(adminToken, { silent: true });
    } catch {
      toast("操作失败，请重试", "error");
    }
  }

  async function saveReferralRatio() {
    const pct = parseFloat(referralRatioInput);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      toast("请输入 0~100 的百分比", "error");
      return;
    }
    setSavingReferralRatio(true);
    try {
      await fetchAdminApi("/api/admin/config/referral-ratio", adminToken, {
        method: "POST",
        body: JSON.stringify({ referralCommissionRatio: pct / 100 })
      });
      toast(`二级分销比例已设为 ${pct}%`);
      await loadData(adminToken, { silent: true });
    } catch {
      toast("保存失败，请重试", "error");
    } finally {
      setSavingReferralRatio(false);
    }
  }

  async function toggleReferral(enabled: boolean) {
    try {
      await fetchAdminApi("/api/admin/config/referral-enabled", adminToken, {
        method: "POST",
        body: JSON.stringify({ enabled })
      });
      toast(enabled ? "已开启二级分销（小程序显示邀请入口）" : "已关闭二级分销（不再绑新下线/计提成）");
      await loadData(adminToken, { silent: true });
    } catch {
      toast("操作失败，请重试", "error");
    }
  }

  async function openDownline(userId: string, nickname: string) {
    setDownlineModal({ nickname });
    setDownlines([]);
    setDownlineLoading(true);
    try {
      const { downlines: rows } = await fetchAdminApi<{ downlines: Downline[] }>(
        `/api/admin/users/${userId}/downline`,
        adminToken
      );
      setDownlines(rows);
    } catch {
      toast("加载下线失败，请重试", "error");
    } finally {
      setDownlineLoading(false);
    }
  }

  async function submitRebateRatio() {
    if (!ratioModal) return;
    const raw = ratioInput.trim();
    let ratio: number | null = null;
    if (raw !== "") {
      const pct = parseFloat(raw);
      if (isNaN(pct) || pct < 0 || pct > 100) {
        toast("请输入 0~100 的百分比，或留空用全局", "error");
        return;
      }
      ratio = pct / 100;
    }
    await fetchAdminApi(`/api/admin/users/${ratioModal.userId}/rebate-ratio`, adminToken, {
      method: "POST",
      body: JSON.stringify({ ratio })
    });
    toast(ratio === null ? `「${ratioModal.nickname}」改用全局比例` : `「${ratioModal.nickname}」返利比例设为 ${Math.round(ratio * 100)}%`);
    setRatioModal(null);
    setRatioInput("");
    await loadData(adminToken, { silent: true });
  }

  async function syncOrders() {
    if (syncing) return;
    setSyncing(true);
    try {
      const result = await fetchAdminApi<{ ok: boolean; taobao: { synced: number; attributed: number }; jd: { synced: number; attributed: number } }>(
        "/api/jobs/sync-tbk-orders",
        adminToken,
        { method: "POST", body: "{}", headers: { "content-type": "application/json" } }
      );
      toast(`同步完成：淘宝 ${result.taobao.synced} 单，京东 ${result.jd.synced} 单`);
      await Promise.all([loadData(adminToken, { silent: true }), loadOrders(1)]);
    } catch {
      toast("同步失败，请稍后重试", "error");
    } finally {
      setSyncing(false);
    }
  }

  async function reviewClaim(id: string, status: "approved" | "rejected") {
    await fetchAdminApi(`/api/admin/claims/${id}/review`, adminToken, {
      method: "POST",
      body: JSON.stringify({ status })
    });
    toast(status === "approved" ? "申诉已通过" : "申诉已驳回");
    await loadData(adminToken, { silent: true });
  }

  useEffect(() => {
    if (adminToken) {
      void loadData(adminToken, { silent: true });
    }
  }, []);

  useEffect(() => {
    const sections = NAV_ITEMS.map((item) => document.getElementById(item.id)).filter(Boolean) as HTMLElement[];
    if (sections.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length > 0) {
          setActiveNav(visible[0].target.id);
        }
      },
      { rootMargin: "-30% 0px -60% 0px" }
    );
    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, [authed]);

  const metrics = data.overview.metrics;

  if (!authed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 via-slate-50 to-slate-100 px-4">
        <Toaster />
        <div className="w-full max-w-sm rounded-2xl border border-slate-200/80 bg-white p-8 shadow-xl shadow-slate-200/60">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-lg font-bold text-white">
            白
          </div>
          <h1 className="mt-5 text-xl font-semibold text-slate-900">良匠省钱助手 · 运营后台</h1>
          <p className="mt-1.5 text-sm text-slate-500">输入管理员 Token 进入控制台</p>
          <input
            autoFocus
            className="mt-6 h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 text-sm outline-none transition-colors focus:border-emerald-400 focus:bg-white"
            placeholder="管理员 Token"
            type="password"
            value={tokenInput}
            onChange={(event) => setTokenInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void login();
            }}
          />
          <Button className="mt-4 w-full" disabled={loading || !tokenInput.trim()} onClick={() => void login()}>
            {loading ? "验证中…" : "进入后台"}
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen text-slate-900">
      <Toaster />
      <div className="grid min-h-screen grid-cols-[232px_1fr]">
        <aside className="sticky top-0 flex h-screen flex-col border-r border-slate-200/80 bg-white px-3 py-5">
          <div className="flex items-center gap-2.5 px-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 text-sm font-bold text-white">
              白
            </div>
            <div>
              <div className="text-sm font-semibold leading-tight">良匠省钱助手</div>
              <div className="text-xs text-slate-400">运营后台</div>
            </div>
          </div>

          <nav className="mt-7 flex flex-col gap-0.5">
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
              <a
                key={id}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                  activeNav === id
                    ? "bg-emerald-50 font-medium text-emerald-700"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                }`}
                href={`#${id}`}
              >
                <Icon className="h-4 w-4" />
                {label}
                {id === "attribution" && metrics.pendingAttributionCount > 0 ? (
                  <span className="ml-auto rounded-full bg-amber-100 px-1.5 text-xs font-medium text-amber-700">
                    {metrics.pendingAttributionCount}
                  </span>
                ) : null}
              </a>
            ))}
          </nav>

          <button
            className="mt-auto flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600"
            onClick={logout}
          >
            <LogOut className="h-4 w-4" />
            退出后台
          </button>
        </aside>

        <section className="px-8 py-7">
          <header className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold">运营控制台</h1>
              <p className="mt-1 text-sm text-slate-500">用户、线报、订单与配置</p>
            </div>
            <div className="flex gap-2">
              <Button disabled={syncing} variant="outline" onClick={() => void syncOrders()}>
                <RotateCcw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? "同步中…" : "同步订单"}
              </Button>
              <Button disabled={loading} variant="outline" onClick={() => void loadData()}>
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                刷新
              </Button>
            </div>
          </header>

          <section id="overview" className="mt-6 grid grid-cols-5 gap-3">
            <MetricCard icon={<Users className="h-4 w-4" />} label="用户数" value={metrics.userCount} note="注册用户" />
            <MetricCard icon={<WalletCards className="h-4 w-4" />} label="转化数" value={metrics.conversionCount} note="生成内容" />
            <MetricCard icon={<Copy className="h-4 w-4" />} label="复制事件" value={metrics.copyEventCount} note="归因依据" />
            <MetricCard
              highlight={metrics.pendingAttributionCount > 0}
              icon={<ClipboardCheck className="h-4 w-4" />}
              label="待复核"
              value={metrics.pendingAttributionCount}
              note="需人工处理"
            />
            <MetricCard icon={<ShieldQuestion className="h-4 w-4" />} label="申诉记录" value={metrics.orderClaimCount} note="用户提交" />
          </section>

          <SyncStatusCard status={syncStatus} />

          <DealManager adminToken={adminToken} />

          <SectionCard id="users" title="用户" subtitle="昵称、推广数据与账号状态">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>昵称</TableHead>
                  <TableHead>用户 ID</TableHead>
                  <TableHead>OpenID</TableHead>
                  <TableHead>转化</TableHead>
                  <TableHead>复制</TableHead>
                  <TableHead>申诉</TableHead>
                  <TableHead>上级</TableHead>
                  <TableHead>下级</TableHead>
                  <TableHead>返利比例</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-2">
                        {user.avatarUrl ? (
                          <img alt="" className="h-7 w-7 rounded-full object-cover" src={mediaUrl(user.avatarUrl)} />
                        ) : (
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50 text-xs font-semibold text-emerald-600">
                            {(user.nickname || "未")[0]}
                          </span>
                        )}
                        {user.nickname || "未设置"}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-500">{user.id}</TableCell>
                    <TableCell className="max-w-40 truncate font-mono text-xs text-slate-500">{user.openid}</TableCell>
                    <TableCell>{user.conversionCount}</TableCell>
                    <TableCell>{user.copyEventCount}</TableCell>
                    <TableCell>{user.claimCount}</TableCell>
                    <TableCell>
                      {user.inviterId ? (
                        <span className="text-xs text-slate-600">{user.inviterNickname || user.inviterId.slice(0, 8)}</span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {user.downlineCount > 0 ? (
                        <button
                          className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600 hover:bg-emerald-100"
                          onClick={() => void openDownline(user.id, user.nickname ?? user.id)}
                        >
                          {user.downlineCount} 人 ›
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">0</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {user.rebateRatio != null ? (
                        <Badge variant="warning">{Math.round(user.rebateRatio * 100)}%</Badge>
                      ) : (
                        <span className="text-xs text-slate-400">全局</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.status === "banned" ? "danger" : "success"}>
                        {user.status === "banned" ? "已封禁" : "正常"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => { setRatioModal({ userId: user.id, nickname: user.nickname ?? user.id }); setRatioInput(user.rebateRatio != null ? String(Math.round(user.rebateRatio * 100)) : ""); }}>
                          返利%
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => { setPointsModal({ userId: user.id, nickname: user.nickname ?? user.id }); setPointsDelta(""); }}>
                          调积分
                        </Button>
                        {user.status === "banned" ? (
                          <Button size="sm" variant="outline" onClick={() => void setUserStatus(user.id, "active")}>解封</Button>
                        ) : (
                          <Button size="sm" variant="danger" onClick={() => void setUserStatus(user.id, "banned")}>封禁</Button>
                        )}
                        <Button size="sm" variant="danger" onClick={() => void deleteUser(user.id, user.nickname ?? user.id)}>删除</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {data.users.length === 0 ? <EmptyRow colSpan={11} text="暂无用户数据" /> : null}
              </TableBody>
            </Table>
          </SectionCard>

          <SectionCard
            id="all-orders"
            title="全部订单"
            subtitle={`共 ${orders.total} 条，每页 50 条`}
            headerRight={
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" disabled={ordersPage <= 1 || ordersLoading} onClick={() => void loadOrders(ordersPage - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs text-slate-500">第 {ordersPage} / {Math.max(1, Math.ceil(orders.total / 50))} 页</span>
                <Button size="sm" variant="ghost" disabled={ordersPage >= Math.ceil(orders.total / 50) || ordersLoading} onClick={() => void loadOrders(ordersPage + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="outline" disabled={ordersLoading} onClick={() => void loadOrders(ordersPage)}>
                  <RefreshCw className={`h-4 w-4 ${ordersLoading ? "animate-spin" : ""}`} />
                </Button>
              </div>
            }
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>订单号</TableHead>
                  <TableHead>商品</TableHead>
                  <TableHead>付款时间</TableHead>
                  <TableHead>订单状态</TableHead>
                  <TableHead className="text-right">实付金额</TableHead>
                  <TableHead className="text-right">预估佣金</TableHead>
                  <TableHead className="text-right">结算佣金</TableHead>
                  <TableHead>归因状态</TableHead>
                  <TableHead>归因用户</TableHead>
                  <TableHead className="text-right">标记状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.items.map((order) => {
                  const statusLabel = order.orderStatus === "settled" ? "已结算" : order.orderStatus === "refunded" ? "已关闭" : order.orderStatus === "received" ? "已收货" : "已付款";
                  const statusVariant = order.orderStatus === "settled" ? "success" : order.orderStatus === "refunded" ? "danger" : order.orderStatus === "received" ? "warning" : "secondary";
                  const attrLabel = order.attribution?.status === "auto_matched" ? "自动匹配" : order.attribution?.status === "manual_matched" ? "人工匹配" : order.attribution?.status === "pending_review" ? "待复核" : order.attribution?.status === "unmatched" ? "未匹配" : "无归因";
                  const attrVariant = (order.attribution?.status === "auto_matched" || order.attribution?.status === "manual_matched") ? "success" : order.attribution?.status === "pending_review" ? "warning" : "secondary";
                  return (
                    <TableRow key={order.id}>
                      <TableCell className="max-w-40 truncate font-mono text-xs text-slate-400" title={order.tbkOrderId}>{order.tbkOrderId}</TableCell>
                      <TableCell className="max-w-56 truncate font-medium" title={order.itemTitle}>{order.itemTitle}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-slate-500">
                        {new Date(order.payTime).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </TableCell>
                      <TableCell><Badge variant={statusVariant}>{statusLabel}</Badge></TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(order.payAmountCents)}</TableCell>
                      <TableCell className="text-right tabular-nums text-slate-500">{formatMoney(order.estimatedCommissionCents)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium text-emerald-600">
                        {order.settledCommissionCents != null ? formatMoney(order.settledCommissionCents) : "—"}
                      </TableCell>
                      <TableCell><Badge variant={attrVariant}>{attrLabel}</Badge></TableCell>
                      <TableCell className="text-sm">{order.attribution?.userNickname ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1.5">
                          {order.orderStatus !== "received" && order.orderStatus !== "settled" ? (
                            <Button size="sm" variant="outline" disabled={markingOrderId === order.id} onClick={() => void markOrderStatus(order.id, "received")}>收货</Button>
                          ) : null}
                          {order.orderStatus !== "settled" ? (
                            <Button size="sm" disabled={markingOrderId === order.id} onClick={() => void markOrderStatus(order.id, "settled")}>结算</Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {orders.items.length === 0 ? <EmptyRow colSpan={10} text={ordersLoading ? "加载中…" : "暂无订单数据"} /> : null}
              </TableBody>
            </Table>
          </SectionCard>

          <SectionCard id="attribution" title="订单归因复核" subtitle="处理自动匹配不确定和未匹配的订单">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>商品</TableHead>
                  <TableHead>候选用户</TableHead>
                  <TableHead>置信度</TableHead>
                  <TableHead>原因</TableHead>
                  <TableHead>预估佣金</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.pendingAttributions.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="max-w-64 truncate font-medium">{row.order.itemTitle}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-500">{row.userId ?? "未匹配"}</TableCell>
                    <TableCell>
                      <Badge variant={row.confidence >= 0.5 ? "warning" : "secondary"}>
                        {(row.confidence * 100).toFixed(0)}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-500">{row.reason}</TableCell>
                    <TableCell>{formatMoney(row.order.estimatedCommissionCents)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" disabled={!row.userId} onClick={() => void approveAttribution(row.id, row.userId)}>
                        <Check className="h-4 w-4" />
                        通过
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {data.pendingAttributions.length === 0 ? <EmptyRow colSpan={6} text="暂无待复核订单 🎉" /> : null}
              </TableBody>
            </Table>
          </SectionCard>

          <SectionCard id="claims" title="订单申诉审核" subtitle="用户提交的漏单补充，核对后通过或驳回">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>用户 OpenID</TableHead>
                  <TableHead>订单后缀</TableHead>
                  <TableHead>备注</TableHead>
                  <TableHead>截图</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.claims.map((claim) => (
                  <TableRow key={claim.id}>
                    <TableCell className="max-w-40 truncate font-mono text-xs text-slate-500">{claim.userOpenid}</TableCell>
                    <TableCell className="font-medium">{claim.orderSuffix}</TableCell>
                    <TableCell className="max-w-56 truncate text-slate-500">{claim.notes || "—"}</TableCell>
                    <TableCell>
                      {claim.screenshotUrl ? (
                        <a
                          className="text-sm font-medium text-emerald-600 hover:underline"
                          href={mediaUrl(claim.screenshotUrl)}
                          rel="noreferrer"
                          target="_blank"
                        >
                          查看
                        </a>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          claim.status === "approved" ? "success" : claim.status === "rejected" ? "danger" : "warning"
                        }
                      >
                        {claim.status === "pending_review" ? "待审核" : claim.status === "approved" ? "已通过" : "已驳回"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {claim.status === "pending_review" ? (
                        <span className="flex justify-end gap-2">
                          <Button size="sm" onClick={() => void reviewClaim(claim.id, "approved")}>
                            <Check className="h-4 w-4" />
                            通过
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => void reviewClaim(claim.id, "rejected")}>
                            驳回
                          </Button>
                        </span>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
                {data.claims.length === 0 ? <EmptyRow colSpan={6} text="暂无申诉记录" /> : null}
              </TableBody>
            </Table>
          </SectionCard>

          <SectionCard id="withdrawals" title="提现审核" subtitle="用户提现申请，核对后打款或驳回">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>用户</TableHead>
                  <TableHead>金额</TableHead>
                  <TableHead>收款方式</TableHead>
                  <TableHead>收款账号</TableHead>
                  <TableHead>备注</TableHead>
                  <TableHead>申请时间</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.withdrawals.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="font-medium">{w.userNickname || w.userOpenid.slice(0, 8) + "…"}</TableCell>
                    <TableCell className="font-semibold tabular-nums">{formatMoney(w.amountCents)}</TableCell>
                    <TableCell>{w.payType === "wechat" ? "微信" : "支付宝"}</TableCell>
                    <TableCell className="font-mono text-xs">{w.payAccount}</TableCell>
                    <TableCell className="max-w-40 truncate text-slate-500">{w.notes || "—"}</TableCell>
                    <TableCell className="text-xs text-slate-400">{new Date(w.createdAt).toLocaleDateString("zh-CN")}</TableCell>
                    <TableCell>
                      <Badge
                        variant={w.status === "paid" ? "success" : w.status === "rejected" ? "danger" : "warning"}
                      >
                        {w.status === "pending" ? "待处理" : w.status === "paid" ? "已打款" : "已驳回"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {w.status === "pending" ? (
                        <span className="flex justify-end gap-2">
                          <Button size="sm" onClick={() => void reviewWithdrawal(w.id, "paid")}>
                            <Check className="h-4 w-4" />
                            已打款
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => void reviewWithdrawal(w.id, "rejected")}>
                            驳回
                          </Button>
                        </span>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
                {data.withdrawals.length === 0 ? <EmptyRow colSpan={8} text="暂无提现申请" /> : null}
              </TableBody>
            </Table>
          </SectionCard>

          <SectionCard
            id="settings"
            title="运营设置"
            subtitle="推广位/模型/密钥等可在线修改，保存后即时生效，无需重新部署"
            headerRight={
              <Button size="sm" disabled={savingSettings} onClick={() => void saveSettings()}>
                {savingSettings ? "保存中…" : "保存设置"}
              </Button>
            }
          >
            <div className="grid grid-cols-2 gap-3 p-5">
              {settings.map((s) => (
                <div key={s.key} className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                    {s.label}
                    {s.secret ? (
                      <span className={`rounded px-1.5 py-0.5 text-[10px] ${s.configured ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
                        {s.configured ? "已配置" : "未配置"}
                      </span>
                    ) : null}
                  </div>
                  <input
                    className="mt-1.5 h-9 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-emerald-400"
                    type={s.secret ? "password" : "text"}
                    placeholder={s.secret ? "留空＝不修改，填入＝覆盖" : "留空＝回落到 env 默认"}
                    value={settingDrafts[s.key] ?? ""}
                    onChange={(e) => setSettingDrafts((prev) => ({ ...prev, [s.key]: e.target.value }))}
                  />
                </div>
              ))}
              {settings.length === 0 ? <div className="col-span-2 py-6 text-center text-sm text-slate-400">加载中…</div> : null}
            </div>
            <div className="px-5 pb-5 text-xs text-slate-400">
              密钥项「只写不回显」：只显示是否已配置，永不返回原值；留空保存代表不改动。订单同步间隔/窗口改完下一轮生效。
            </div>
          </SectionCard>

          <SectionCard id="config" title="系统配置" subtitle="全局返利比例可在线修改，其余为只读">
            <div className="p-5">
              <div className="mb-3 rounded-xl border border-emerald-100 bg-emerald-50/50 px-4 py-3.5">
                <div className="text-xs font-medium text-slate-500">全局返利比例（用户分到佣金的比例）</div>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    className="h-9 w-24 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-emerald-400"
                    type="number"
                    min={0}
                    max={100}
                    value={globalRatioInput}
                    onChange={(e) => setGlobalRatioInput(e.target.value)}
                  />
                  <span className="text-sm text-slate-500">%</span>
                  <Button size="sm" disabled={savingGlobalRatio} onClick={() => void saveGlobalRatio()}>
                    {savingGlobalRatio ? "保存中…" : "保存"}
                  </Button>
                  <span className="ml-1 text-xs text-slate-400">仅对修改后新同步的订单生效</span>
                </div>
              </div>
              <div className="mb-3 rounded-xl border border-indigo-100 bg-indigo-50/50 px-4 py-3.5">
                <div className="text-xs font-medium text-slate-500">二级分销比例（上线吃下线返利的比例）</div>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    className="h-9 w-24 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-indigo-400"
                    type="number"
                    min={0}
                    max={100}
                    value={referralRatioInput}
                    onChange={(e) => setReferralRatioInput(e.target.value)}
                  />
                  <span className="text-sm text-slate-500">%</span>
                  <Button size="sm" disabled={savingReferralRatio} onClick={() => void saveReferralRatio()}>
                    {savingReferralRatio ? "保存中…" : "保存"}
                  </Button>
                  <span className="ml-1 text-xs text-slate-400">平台额外出，下线返利不减</span>
                </div>
              </div>
              <div className="mb-3 flex items-center justify-between rounded-xl border border-indigo-100 bg-indigo-50/40 px-4 py-3.5">
                <div>
                  <div className="text-xs font-medium text-slate-500">二级分销开关（配好比例后再开启）</div>
                  <div className="mt-1 text-sm font-medium text-slate-700">
                    当前：{data.config.referralEnabled ? "已开启 · 绑新下线并计提成、显示邀请入口" : "已关闭 · 不绑新下线、不计提成、隐藏入口"}
                  </div>
                </div>
                <Button
                  variant={data.config.referralEnabled ? "danger" : "default"}
                  onClick={() => void toggleReferral(!data.config.referralEnabled)}
                >
                  {data.config.referralEnabled ? "关闭分销" : "开启分销"}
                </Button>
              </div>
              <div className="mb-3 flex items-center justify-between rounded-xl border border-amber-100 bg-amber-50/40 px-4 py-3.5">
                <div>
                  <div className="text-xs font-medium text-slate-500">兑换功能开关（审核期间关闭，过审后开启）</div>
                  <div className="mt-1 text-sm font-medium text-slate-700">
                    当前：{data.config.exchangeEnabled ? "已开启 · 小程序显示兑换入口" : "已关闭 · 小程序隐藏兑换入口"}
                  </div>
                </div>
                <Button
                  variant={data.config.exchangeEnabled ? "danger" : "default"}
                  onClick={() => void toggleExchange(!data.config.exchangeEnabled)}
                >
                  {data.config.exchangeEnabled ? "关闭兑换" : "开启兑换"}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {configItems.map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3.5">
                    <div className="text-xs font-medium text-slate-400">{label}</div>
                    <div className="mt-1 truncate text-sm font-medium text-slate-700">{value}</div>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>
        </section>
      </div>

      {pointsModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setPointsModal(null)}>
          <div className="w-80 rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold">调整积分</h3>
            <p className="mt-1 text-sm text-slate-500">用户：{pointsModal.nickname}</p>
            <input
              autoFocus
              className="mt-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
              placeholder="积分数量，负数为扣除（如 -500）"
              type="number"
              value={pointsDelta}
              onChange={(e) => setPointsDelta(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void submitAdjustPoints(); }}
            />
            <div className="mt-4 flex gap-2">
              <Button className="flex-1" onClick={() => void submitAdjustPoints()}>确认</Button>
              <Button className="flex-1" variant="outline" onClick={() => setPointsModal(null)}>取消</Button>
            </div>
          </div>
        </div>
      ) : null}

      {ratioModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setRatioModal(null)}>
          <div className="w-80 rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold">设置返利比例</h3>
            <p className="mt-1 text-sm text-slate-500">用户：{ratioModal.nickname}</p>
            <div className="mt-4 flex items-center gap-2">
              <input
                autoFocus
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                placeholder="百分比，留空表示用全局"
                type="number"
                min={0}
                max={100}
                value={ratioInput}
                onChange={(e) => setRatioInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void submitRebateRatio(); }}
              />
              <span className="text-sm text-slate-500">%</span>
            </div>
            <p className="mt-2 text-xs text-slate-400">留空并确认 = 改回用全局比例。仅对之后新订单生效。</p>
            <div className="mt-4 flex gap-2">
              <Button className="flex-1" onClick={() => void submitRebateRatio()}>确认</Button>
              <Button className="flex-1" variant="outline" onClick={() => setRatioModal(null)}>取消</Button>
            </div>
          </div>
        </div>
      ) : null}

      {downlineModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDownlineModal(null)}>
          <div className="max-h-[80vh] w-[34rem] overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h3 className="font-semibold">下线明细</h3>
                <p className="mt-0.5 text-sm text-slate-500">{downlineModal.nickname} 的直接下线</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setDownlineModal(null)}>关闭</Button>
            </div>
            <div className="max-h-[60vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>昵称</TableHead>
                    <TableHead>加入时间</TableHead>
                    <TableHead className="text-right">贡献提成</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {downlineLoading ? (
                    <EmptyRow colSpan={3} text="加载中…" />
                  ) : downlines.length === 0 ? (
                    <EmptyRow colSpan={3} text="暂无下线" />
                  ) : (
                    downlines.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-medium">{d.nickname || "未设置"}</TableCell>
                        <TableCell className="text-xs text-slate-500">{new Date(d.createdAt).toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(d.contributedCents)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function SectionCard({
  id,
  title,
  subtitle,
  headerRight,
  children
}: {
  id: string;
  title: string;
  subtitle: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-5 scroll-mt-6 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>
        </div>
        {headerRight ? <div>{headerRight}</div> : null}
      </div>
      {children}
    </section>
  );
}

function MetricCard({
  icon,
  label,
  value,
  note,
  highlight = false
}: {
  icon?: React.ReactNode;
  label: string;
  value: number;
  note: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border bg-white p-4 shadow-sm shadow-slate-200/40 transition-colors ${
        highlight ? "border-amber-200 bg-amber-50/40" : "border-slate-200/80"
      }`}
    >
      <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${highlight ? "bg-amber-100 text-amber-600" : "bg-emerald-50 text-emerald-600"}`}>
          {icon}
        </span>
        {label}
      </div>
      <div className="mt-3 text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-0.5 text-xs text-slate-400">{note}</div>
    </div>
  );
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

function SyncStatusCard({ status }: { status: SyncStatus | null }) {
  if (!status) return null;
  const { latest, intervalMinutes } = status;

  // 静默卡死不会有失败记录，只能靠「最新记录距今 > 2×间隔」判断
  const stale =
    latest != null && Date.now() - new Date(latest.createdAt).getTime() > intervalMinutes * 2 * 60 * 1000;

  let tone: "ok" | "warn" | "error";
  let badge: string;
  let Icon: typeof CheckCircle2;
  if (!latest) {
    tone = "warn";
    badge = "尚无同步记录";
    Icon = AlertTriangle;
  } else if (!latest.ok) {
    tone = "error";
    badge = "失败";
    Icon = XCircle;
  } else if (stale) {
    tone = "warn";
    badge = "同步可能已停止";
    Icon = AlertTriangle;
  } else {
    tone = "ok";
    badge = "正常";
    Icon = CheckCircle2;
  }

  const toneClass = {
    ok: "border-emerald-200 bg-emerald-50/40 text-emerald-700",
    warn: "border-amber-200 bg-amber-50/50 text-amber-700",
    error: "border-rose-200 bg-rose-50/50 text-rose-700"
  }[tone];

  return (
    <section className="mt-5 scroll-mt-6 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="font-semibold">订单同步</h2>
          <p className="mt-0.5 text-sm text-slate-400">最近一次同步状态（每 {intervalMinutes} 分钟自动跑一次）</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${toneClass}`}>
          <Icon className="h-3.5 w-3.5" />
          {badge}
        </span>
      </div>
      <div className="px-5 py-4 text-sm">
        {latest ? (
          <>
            <div className="text-slate-600">
              上次同步：{formatRelativeTime(latest.createdAt)}
              （{latest.trigger === "manual" ? "手动" : "自动"}） · 耗时 {(latest.durationMs / 1000).toFixed(1)}s
            </div>
            <div className="mt-1.5 text-slate-500">
              抓取：淘宝 <span className="font-medium text-slate-700">{latest.taobaoSynced}</span> 单 · 京东{" "}
              <span className="font-medium text-slate-700">{latest.jdSynced}</span> 单 · 归因{" "}
              <span className="font-medium text-slate-700">{latest.taobaoAttributed + latest.jdAttributed}</span> 单
            </div>
            {latest.errorMessage ? (
              <div className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">
                原因：{latest.errorMessage}
              </div>
            ) : null}
            {stale && latest.ok ? (
              <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-600">
                已超过 {intervalMinutes * 2} 分钟没有新同步记录，定时任务可能已停止，请检查服务。
              </div>
            ) : null}
          </>
        ) : (
          <div className="text-slate-500">系统启动后还没有跑过同步，可点右上角「同步订单」手动触发一次。</div>
        )}
      </div>
    </section>
  );
}

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <TableRow>
      <TableCell className="py-10 text-center text-sm text-slate-400" colSpan={colSpan}>
        {text}
      </TableCell>
    </TableRow>
  );
}

function formatMoney(amountCents: number) {
  return `¥${(amountCents / 100).toFixed(2)}`;
}
