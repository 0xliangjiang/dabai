import {
  AlertTriangle,
  ArrowDownToLine,
  BookOpenText,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Copy,
  Download,
  Eye,
  Inbox,
  LayoutDashboard,
  Menu,
  MoreHorizontal,
  LogOut,
  Megaphone,
  PackageSearch,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Footprints,
  KeyRound,
  ShieldQuestion,
  Users,
  WalletCards,
  X,
  XCircle
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import {
  ClearFiltersButton,
  DataToolbar,
  FilterSelect,
  SearchInput,
  TableFooter
} from "./components/ui/data-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./components/ui/table";
import { Toaster } from "./components/ui/toaster";
import { DealManager } from "./DealManager";
import { ArticleManager } from "./ArticleManager";
import { SportsCodeManager, SportsUserManager } from "./SportsManagement";
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
  type AdminUserDetail,
  type AdminWithdrawal,
  type AdminConversion,
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
    referralEnabled: false,
    ordersTabEnabled: true,
    sportsEnabled: true
  },
  pendingAttributions: [],
  claims: [],
  withdrawals: []
};

const NAV_GROUPS = [
  {
    label: "运营",
    items: [
      { id: "overview", label: "概览", icon: LayoutDashboard },
      { id: "deals", label: "线报管理", icon: Megaphone },
      { id: "articles", label: "文章管理", icon: BookOpenText },
      { id: "users", label: "用户", icon: Users }
    ]
  },
  {
    label: "订单与归因",
    items: [
      { id: "all-orders", label: "全部订单", icon: PackageSearch },
      { id: "conversions", label: "查询历史", icon: Search },
      { id: "attribution", label: "待复核", icon: ClipboardCheck },
      { id: "claims", label: "申诉审核", icon: ShieldQuestion }
    ]
  },
  {
    label: "步数管理",
    items: [
      { id: "sports-users", label: "用户管理", icon: Footprints },
      { id: "sports-codes", label: "卡密管理", icon: KeyRound }
    ]
  },
  {
    label: "财务",
    items: [{ id: "withdrawals", label: "提现审核", icon: ArrowDownToLine }]
  },
  {
    label: "系统",
    items: [
      { id: "settings", label: "运营设置", icon: Settings },
      { id: "config", label: "系统配置", icon: Settings }
    ]
  }
];

const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

export function App() {
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem("dabai-admin-token") ?? "");
  const [tokenInput, setTokenInput] = useState("");
  const [authed, setAuthed] = useState(false);
  const [data, setData] = useState<AdminData>(emptyData);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [reattributing, setReattributing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [activeNav, setActiveNav] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [orders, setOrders] = useState<{ total: number; items: AdminOrder[] }>({ total: 0, items: [] });
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersSearch, setOrdersSearch] = useState("");
  const [ordersStatus, setOrdersStatus] = useState("");
  const [ordersAttr, setOrdersAttr] = useState("");
  const [exportingOrders, setExportingOrders] = useState(false);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersPage, setUsersPage] = useState(1);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersSearch, setUsersSearch] = useState("");
  const [usersStatus, setUsersStatus] = useState("");
  const [usersRelation, setUsersRelation] = useState("");
  const [usersSort, setUsersSort] = useState("newest");
  const [conversions, setConversions] = useState<AdminConversion[]>([]);
  const [conversionsTotal, setConversionsTotal] = useState(0);
  const [conversionsPage, setConversionsPage] = useState(1);
  const [conversionsSearch, setConversionsSearch] = useState("");
  const [conversionsPlatform, setConversionsPlatform] = useState("");
  const [conversionsLoading, setConversionsLoading] = useState(false);
  const [attributionSearch, setAttributionSearch] = useState("");
  const [attributionStatus, setAttributionStatus] = useState("");
  const [attributionPage, setAttributionPage] = useState(1);
  const [claimSearch, setClaimSearch] = useState("");
  const [claimStatus, setClaimStatus] = useState("");
  const [claimPage, setClaimPage] = useState(1);
  const [withdrawalSearch, setWithdrawalSearch] = useState("");
  const [withdrawalStatus, setWithdrawalStatus] = useState("");
  const [withdrawalPage, setWithdrawalPage] = useState(1);
  const [markingOrderId, setMarkingOrderId] = useState("");
  const [pointsModal, setPointsModal] = useState<{ userId: string; nickname: string } | null>(null);
  const [pointsDelta, setPointsDelta] = useState("");
  const [ratioModal, setRatioModal] = useState<{ userId: string; nickname: string } | null>(null);
  const [ratioInput, setRatioInput] = useState("");
  const [downlineModal, setDownlineModal] = useState<{ nickname: string } | null>(null);
  const [downlines, setDownlines] = useState<Downline[]>([]);
  const [downlineLoading, setDownlineLoading] = useState(false);
  const [userDetailTarget, setUserDetailTarget] = useState<{ id: string; nickname: string } | null>(null);
  const [userDetail, setUserDetail] = useState<AdminUserDetail | null>(null);
  const [userDetailLoading, setUserDetailLoading] = useState(false);
  const [userActionTarget, setUserActionTarget] = useState<AdminUser | null>(null);
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

  const filteredAttributions = useMemo(() => {
    const search = attributionSearch.trim().toLowerCase();
    return data.pendingAttributions.filter((row) => {
      if (attributionStatus && row.status !== attributionStatus) return false;
      if (!search) return true;
      return [row.order.itemTitle, row.userId ?? "", row.reason]
        .some((value) => value.toLowerCase().includes(search));
    });
  }, [attributionSearch, attributionStatus, data.pendingAttributions]);

  const filteredClaims = useMemo(() => {
    const search = claimSearch.trim().toLowerCase();
    return data.claims.filter((claim) => {
      if (claimStatus && claim.status !== claimStatus) return false;
      if (!search) return true;
      return [claim.userOpenid, claim.orderSuffix, claim.notes ?? ""]
        .some((value) => value.toLowerCase().includes(search));
    });
  }, [claimSearch, claimStatus, data.claims]);

  const filteredWithdrawals = useMemo(() => {
    const search = withdrawalSearch.trim().toLowerCase();
    return data.withdrawals.filter((withdrawal) => {
      if (withdrawalStatus && withdrawal.status !== withdrawalStatus) return false;
      if (!search) return true;
      return [
        withdrawal.userNickname ?? "",
        withdrawal.userOpenid,
        withdrawal.payAccount,
        withdrawal.notes ?? ""
      ].some((value) => value.toLowerCase().includes(search));
    });
  }, [data.withdrawals, withdrawalSearch, withdrawalStatus]);

  const pagedAttributions = filteredAttributions.slice((attributionPage - 1) * 25, attributionPage * 25);
  const pagedClaims = filteredClaims.slice((claimPage - 1) * 25, claimPage * 25);
  const pagedWithdrawals = filteredWithdrawals.slice((withdrawalPage - 1) * 25, withdrawalPage * 25);

  useEffect(() => {
    setAttributionPage((page) => Math.min(page, Math.max(1, Math.ceil(filteredAttributions.length / 25))));
    setClaimPage((page) => Math.min(page, Math.max(1, Math.ceil(filteredClaims.length / 25))));
    setWithdrawalPage((page) => Math.min(page, Math.max(1, Math.ceil(filteredWithdrawals.length / 25))));
  }, [filteredAttributions.length, filteredClaims.length, filteredWithdrawals.length]);

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
        fetchAdminApi<{ users: AdminUser[]; total: number }>("/api/admin/users?page=1&pageSize=50", token),
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
      setUsersTotal(usersResponse.total ?? usersResponse.users.length);
      setUsersPage(1);
      setUsersSearch("");
      setUsersStatus("");
      setUsersRelation("");
      setUsersSort("newest");
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
      void fetchAdminApi<{ conversions: AdminConversion[]; total: number }>(
        "/api/admin/conversions?page=1&pageSize=50",
        token
      )
        .then((r) => { setConversions(r.conversions); setConversionsTotal(r.total); setConversionsPage(1); })
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
    if (status === "settled" && !window.confirm("标记已结算会把奖励值发放到归属用户，确定吗？")) return;
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

  async function loadOrders(
    page = ordersPage,
    status = ordersStatus,
    attr = ordersAttr,
    search = ordersSearch
  ) {
    setOrdersLoading(true);
    try {
      const q = new URLSearchParams({ page: String(page), pageSize: "50" });
      if (status) q.set("orderStatus", status);
      if (attr) q.set("attributionStatus", attr);
      if (search.trim()) q.set("search", search.trim());
      const result = await fetchAdminApi<{ total: number; items: AdminOrder[] }>(
        `/api/admin/orders?${q.toString()}`,
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

  async function loadConversions(page = 1, search = conversionsSearch, platform = conversionsPlatform) {
    setConversionsLoading(true);
    try {
      const q = new URLSearchParams({ page: String(page), pageSize: "50" });
      if (search.trim()) q.set("search", search.trim());
      if (platform) q.set("platform", platform);
      const r = await fetchAdminApi<{ conversions: AdminConversion[]; total: number }>(
        `/api/admin/conversions?${q.toString()}`,
        adminToken
      );
      setConversions(r.conversions);
      setConversionsTotal(r.total);
      setConversionsPage(page);
    } catch {
      toast("查询历史加载失败", "error");
    } finally {
      setConversionsLoading(false);
    }
  }

  async function loadUsers(
    page = usersPage,
    search = usersSearch,
    status = usersStatus,
    relation = usersRelation,
    sort = usersSort
  ) {
    setUsersLoading(true);
    try {
      const q = new URLSearchParams({ page: String(page), pageSize: "50" });
      if (search.trim()) q.set("search", search.trim());
      if (status) q.set("status", status);
      if (relation) q.set("relation", relation);
      if (sort !== "newest") q.set("sort", sort);
      const r = await fetchAdminApi<{ users: AdminUser[]; total: number }>(
        `/api/admin/users?${q.toString()}`,
        adminToken
      );
      setData((prev) => ({ ...prev, users: r.users }));
      setUsersTotal(r.total);
      setUsersPage(page);
    } catch {
      toast("用户加载失败", "error");
    } finally {
      setUsersLoading(false);
    }
  }

  function resetUserFilters() {
    setUsersSearch("");
    setUsersStatus("");
    setUsersRelation("");
    setUsersSort("newest");
    void loadUsers(1, "", "", "", "newest");
  }

  async function exportAllOrders() {
    if (exportingOrders) return;
    setExportingOrders(true);
    try {
      const all: AdminOrder[] = [];
      const MAX_PAGES = 50; // 封顶 5000 条，防数据过大跑飞
      let page = 1;
      let total = 0;
      while (page <= MAX_PAGES) {
        const q = new URLSearchParams({ page: String(page), pageSize: "100" });
        if (ordersStatus) q.set("orderStatus", ordersStatus);
        if (ordersAttr) q.set("attributionStatus", ordersAttr);
        if (ordersSearch.trim()) q.set("search", ordersSearch.trim());
        const r = await fetchAdminApi<{ total: number; items: AdminOrder[] }>(`/api/admin/orders?${q.toString()}`, adminToken);
        total = r.total;
        all.push(...r.items);
        if (all.length >= r.total || r.items.length === 0) break;
        page += 1;
      }
      if (all.length === 0) {
        toast("没有符合条件的订单", "error");
        return;
      }
      downloadCsv(
        "订单_全部.csv",
        ["订单号", "商品", "付款时间", "订单状态", "实付(元)", "预估佣金(元)", "结算佣金(元)", "归因状态", "归因用户"],
        all.map((o) => [
          o.tbkOrderId,
          o.itemTitle,
          new Date(o.payTime).toLocaleString("zh-CN"),
          o.orderStatus,
          yuan(o.payAmountCents),
          yuan(o.estimatedCommissionCents),
          yuan(o.settledCommissionCents),
          o.attribution?.status ?? "",
          o.attribution?.userNickname ?? o.attribution?.userId ?? ""
        ])
      );
      toast(all.length < total ? `数据较多，已导出最近 ${all.length}/${total} 条` : `已导出 ${all.length} 条`);
    } catch {
      toast("导出失败，请重试", "error");
    } finally {
      setExportingOrders(false);
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
    if (status === "banned" && !window.confirm("确定封禁该用户？封禁后其无法使用小程序。")) return;
    await fetchAdminApi(`/api/admin/users/${id}/status`, adminToken, {
      method: "POST",
      body: JSON.stringify({ status })
    });
    toast(status === "banned" ? "已封禁该用户" : "已解封该用户");
    await loadData(adminToken, { silent: true });
  }

  async function reviewWithdrawal(id: string, status: "paid" | "rejected") {
    const ok = window.confirm(status === "paid" ? "确认这笔提现已打款？标记后不可撤销。" : "确定驳回这笔提现申请？");
    if (!ok) return;
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
    if (!delta || isNaN(delta)) { toast("请输入有效的奖励值", "error"); return; }
    await fetchAdminApi(`/api/admin/users/${pointsModal.userId}/adjust-points`, adminToken, {
      method: "POST",
      body: JSON.stringify({ delta, reason: "admin_manual" })
    });
    toast(`已为「${pointsModal.nickname}」${delta > 0 ? "增加" : "扣除"} ${Math.abs(delta)} 奖励值`);
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

  async function toggleOrdersTab(enabled: boolean) {
    try {
      await fetchAdminApi("/api/admin/config/orders-tab-enabled", adminToken, {
        method: "POST",
        body: JSON.stringify({ enabled })
      });
      toast(enabled ? "已显示订单 tab" : "已隐藏订单 tab（审核用）");
      await loadData(adminToken, { silent: true });
    } catch {
      toast("操作失败，请重试", "error");
    }
  }

  async function toggleSports(enabled: boolean) {
    try {
      await fetchAdminApi("/api/admin/config/sports-enabled", adminToken, {
        method: "POST",
        body: JSON.stringify({ enabled })
      });
      toast(enabled ? "已允许新用户使用运动账号服务" : "已暂停新用户使用，已绑定用户不受影响");
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

  async function loadUserDetail(userId: string, orderPage = 1, downlinePage = 1) {
    setUserDetailLoading(true);
    try {
      const query = new URLSearchParams({
        orderPage: String(orderPage),
        downlinePage: String(downlinePage),
        pageSize: "20"
      });
      const detail = await fetchAdminApi<AdminUserDetail>(
        `/api/admin/users/${userId}/detail?${query.toString()}`,
        adminToken
      );
      setUserDetail(detail);
    } catch {
      toast("用户详情加载失败，请重试", "error");
    } finally {
      setUserDetailLoading(false);
    }
  }

  function openUserDetail(user: AdminUser) {
    setUserDetailTarget({ id: user.id, nickname: user.nickname || "未设置昵称" });
    setUserDetail(null);
    void loadUserDetail(user.id);
  }

  function closeUserDetail() {
    setUserDetailTarget(null);
    setUserDetail(null);
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

  // 一键把"订单已结算但返利仍待结算"的存量订单重算入账
  async function reconcileSettled() {
    if (reconciling) return;
    setReconciling(true);
    try {
      const result = await fetchAdminApi<{ ok: boolean; scanned: number; fixed: number }>(
        "/api/admin/orders/reconcile-settled",
        adminToken,
        { method: "POST", body: "{}", headers: { "content-type": "application/json" } }
      );
      toast(result.fixed > 0 ? `已核对 ${result.scanned} 单，修复入账 ${result.fixed} 单` : "没有需要修复的订单，全部已对账");
      await Promise.all([loadData(adminToken, { silent: true }), loadOrders(ordersPage)]);
    } catch {
      toast("核对失败，请稍后重试", "error");
    } finally {
      setReconciling(false);
    }
  }

  // 一键对历史「待复核/未归因」订单用最新逻辑重跑归因
  async function reattributeOrders() {
    if (reattributing) return;
    setReattributing(true);
    try {
      const result = await fetchAdminApi<{ ok: boolean; scanned: number; attributed: number }>(
        "/api/admin/orders/reattribute",
        adminToken,
        { method: "POST", body: "{}", headers: { "content-type": "application/json" } }
      );
      toast(result.attributed > 0 ? `重跑 ${result.scanned} 单，新归因 ${result.attributed} 单` : `重跑 ${result.scanned} 单，暂无可自动归因的`);
      await Promise.all([loadData(adminToken, { silent: true }), loadOrders(ordersPage)]);
    } catch {
      toast("重跑归因失败，请稍后重试", "error");
    } finally {
      setReattributing(false);
    }
  }

  async function reviewClaim(id: string, status: "approved" | "rejected") {
    if (!window.confirm(status === "approved" ? "确定通过这条申诉？" : "确定驳回这条申诉？")) return;
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

  // 切到某模块时按需加载其数据（首次进入懒加载，避免一上来全量请求）
  useEffect(() => {
    if (!authed) return;
    if (activeNav === "all-orders") void loadOrders(ordersPage);
    if (activeNav === "conversions" && conversions.length === 0) void loadConversions(1);
  }, [activeNav, authed]);

  const metrics = data.overview.metrics;
  const activeLabel = NAV_ITEMS.find((n) => n.id === activeNav)?.label ?? "概览";
  const pendingClaimsCount = data.claims.filter((c) => c.status === "pending_review").length;
  const pendingWithdrawalsCount = data.withdrawals.filter((w) => w.status === "pending").length;

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
      {sidebarOpen ? (
        <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      ) : null}
      <div className="lg:grid lg:min-h-screen lg:grid-cols-[232px_1fr]">
        <aside
          className={`fixed inset-y-0 left-0 z-40 flex h-screen w-[232px] transform flex-col border-r border-slate-200/80 bg-white px-3 py-5 transition-transform lg:sticky lg:top-0 lg:z-auto lg:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center gap-2.5 px-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 text-sm font-bold text-white">
              白
            </div>
            <div>
              <div className="text-sm font-semibold leading-tight">良匠省钱助手</div>
              <div className="text-xs text-slate-400">运营后台</div>
            </div>
          </div>

          <nav className="mt-6 flex flex-col gap-4 overflow-y-auto">
            {NAV_GROUPS.map((group) => (
              <div key={group.label} className="flex flex-col gap-0.5">
                <div className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  {group.label}
                </div>
                {group.items.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      activeNav === id
                        ? "bg-emerald-50 font-medium text-emerald-700"
                        : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                    }`}
                    onClick={() => { setActiveNav(id); setSidebarOpen(false); }}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                    {id === "attribution" && metrics.pendingAttributionCount > 0 ? (
                      <span className="ml-auto rounded-full bg-amber-100 px-1.5 text-xs font-medium text-amber-700">
                        {metrics.pendingAttributionCount}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
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

        <section className="min-w-0 px-3 py-4 sm:px-6 sm:py-6 xl:px-8 xl:py-7">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 lg:hidden"
                onClick={() => setSidebarOpen(true)}
                aria-label="菜单"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div>
                <h1 className="text-xl font-semibold">{activeLabel}</h1>
                <p className="mt-1 text-sm text-slate-500">良匠省钱助手 · 运营后台</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
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

          {activeNav === "overview" && (
          <>
          <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <MetricCard icon={<Users className="h-4 w-4" />} label="用户数" value={metrics.userCount} note="注册用户" />
            <MetricCard icon={<WalletCards className="h-4 w-4" />} label="转化数" value={metrics.conversionCount} note="生成内容" />
            <MetricCard icon={<Copy className="h-4 w-4" />} label="复制事件" value={metrics.copyEventCount} note="归因依据" />
            <MetricCard
              highlight={metrics.pendingAttributionCount > 0}
              icon={<ClipboardCheck className="h-4 w-4" />}
              label="待复核"
              value={metrics.pendingAttributionCount}
              note="去处理"
              onClick={() => setActiveNav("attribution")}
            />
            <MetricCard
              icon={<ShieldQuestion className="h-4 w-4" />}
              label="申诉记录"
              value={metrics.orderClaimCount}
              note="去审核"
              onClick={() => setActiveNav("claims")}
            />
          </section>

          <SyncStatusCard status={syncStatus} />

          {(metrics.pendingAttributionCount > 0 || pendingClaimsCount > 0 || pendingWithdrawalsCount > 0) && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
              <div className="text-sm font-medium text-amber-800">待办事项</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {metrics.pendingAttributionCount > 0 && (
                  <button className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-sm text-amber-700 hover:bg-amber-100" onClick={() => setActiveNav("attribution")}>
                    待复核归因 {metrics.pendingAttributionCount} 单 ›
                  </button>
                )}
                {pendingClaimsCount > 0 && (
                  <button className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-sm text-amber-700 hover:bg-amber-100" onClick={() => setActiveNav("claims")}>
                    待审申诉 {pendingClaimsCount} 条 ›
                  </button>
                )}
                {pendingWithdrawalsCount > 0 && (
                  <button className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-sm text-amber-700 hover:bg-amber-100" onClick={() => setActiveNav("withdrawals")}>
                    待审提现 {pendingWithdrawalsCount} 笔 ›
                  </button>
                )}
              </div>
            </div>
          )}
          </>
          )}

          {activeNav === "deals" && <DealManager adminToken={adminToken} />}
          {activeNav === "articles" && <ArticleManager adminToken={adminToken} />}
          {activeNav === "sports-users" && <SportsUserManager adminToken={adminToken} />}
          {activeNav === "sports-codes" && <SportsCodeManager adminToken={adminToken} />}

          {activeNav === "users" && (
          <SectionCard
            id="users"
            title="用户管理"
            subtitle={`当前条件共 ${usersTotal} 人`}
          >
            <DataToolbar
              actions={
                <Button size="sm" variant="outline" disabled={usersLoading} onClick={() => void loadUsers(usersPage)}>
                  <RefreshCw className={`h-4 w-4 ${usersLoading ? "animate-spin" : ""}`} />
                  刷新
                </Button>
              }
            >
              <SearchInput
                placeholder="搜索昵称、OpenID 或用户 ID"
                value={usersSearch}
                onChange={(event) => setUsersSearch(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") void loadUsers(1); }}
              />
              <FilterSelect
                aria-label="用户状态"
                value={usersStatus}
                onChange={(event) => {
                  const value = event.target.value;
                  setUsersStatus(value);
                  void loadUsers(1, usersSearch, value, usersRelation, usersSort);
                }}
              >
                <option value="">全部状态</option>
                <option value="active">正常用户</option>
                <option value="banned">已封禁</option>
              </FilterSelect>
              <FilterSelect
                aria-label="邀请关系"
                value={usersRelation}
                onChange={(event) => {
                  const value = event.target.value;
                  setUsersRelation(value);
                  void loadUsers(1, usersSearch, usersStatus, value, usersSort);
                }}
              >
                <option value="">全部关系</option>
                <option value="has_downline">有直接下线</option>
                <option value="has_inviter">有上级</option>
                <option value="no_inviter">无上级</option>
              </FilterSelect>
              <FilterSelect
                aria-label="排序方式"
                value={usersSort}
                onChange={(event) => {
                  const value = event.target.value;
                  setUsersSort(value);
                  void loadUsers(1, usersSearch, usersStatus, usersRelation, value);
                }}
              >
                <option value="newest">最新注册</option>
                <option value="oldest">最早注册</option>
                <option value="downline_desc">下线最多</option>
              </FilterSelect>
              <Button size="sm" variant="outline" disabled={usersLoading} onClick={() => void loadUsers(1)}>
                查询
              </Button>
              <ClearFiltersButton
                visible={Boolean(usersSearch || usersStatus || usersRelation || usersSort !== "newest")}
                disabled={usersLoading}
                onClick={resetUserFilters}
              />
            </DataToolbar>

            <Table className="min-w-[980px]">
              <TableHeader>
                <TableRow className="bg-white">
                  <TableHead className="w-[260px]">用户</TableHead>
                  <TableHead className="w-[130px]">可用奖励值</TableHead>
                  <TableHead className="w-[150px]">订单与活跃</TableHead>
                  <TableHead className="w-[150px]">邀请关系</TableHead>
                  <TableHead className="w-[90px]">返利</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="w-[120px]">注册时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.users.map((user) => (
                  <TableRow key={user.id} className="group cursor-pointer" onClick={() => openUserDetail(user)}>
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-3">
                        {user.avatarUrl ? (
                          <img alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" src={mediaUrl(user.avatarUrl)} />
                        ) : (
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-sm font-semibold text-emerald-600">
                            {(user.nickname || "未")[0]}
                          </span>
                        )}
                        <div className="min-w-0">
                          <div className="truncate font-medium text-slate-800">{user.nickname || "未设置昵称"}</div>
                          <div className="mt-0.5 max-w-48 truncate font-mono text-[11px] text-slate-400">{user.openid}</div>
                          <div className="max-w-48 truncate font-mono text-[10px] text-slate-300">{user.id}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-lg font-semibold tabular-nums text-emerald-700">
                        {formatRewardValue(user.availableBalanceCents)}
                      </div>
                      <div className="text-[11px] text-slate-400">奖励值</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium tabular-nums text-slate-700">{user.orderCount} 笔订单</div>
                      <div className="mt-1 text-xs tabular-nums text-slate-400">
                        {user.conversionCount} 查询 · {user.copyEventCount} 复制
                        {user.claimCount > 0 ? ` · ${user.claimCount} 申诉` : ""}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="truncate text-xs text-slate-500">
                        上级：{user.inviterId ? user.inviterNickname || user.inviterId.slice(0, 8) : "无"}
                      </div>
                      <div className="mt-1">
                        {user.downlineCount > 0 ? (
                        <button
                          className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
                          onClick={(event) => {
                            event.stopPropagation();
                            void openDownline(user.id, user.nickname ?? user.id);
                          }}
                        >
                          {user.downlineCount} 名直接下线 ›
                        </button>
                      ) : (
                          <span className="text-xs text-slate-400">暂无下线</span>
                      )}
                      </div>
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
                    <TableCell className="whitespace-nowrap text-xs text-slate-500">
                      {new Date(user.createdAt).toLocaleDateString("zh-CN")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}>
                        <Button size="sm" variant="ghost" onClick={() => openUserDetail(user)} title="查看详情">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setUserActionTarget(user)} title="更多操作">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {data.users.length === 0 ? <EmptyRow colSpan={8} loading={usersLoading} text={usersLoading ? "加载中…" : "没有符合条件的用户"} /> : null}
              </TableBody>
            </Table>
            <TableFooter
              page={usersPage}
              pageSize={50}
              total={usersTotal}
              loading={usersLoading}
              onPageChange={(page) => void loadUsers(page)}
            />
          </SectionCard>
          )}

          {activeNav === "all-orders" && (
          <SectionCard
            id="all-orders"
            title="全部订单"
            subtitle={`共 ${orders.total} 条，每页 50 条`}
            headerRight={
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" disabled={reattributing} onClick={() => void reattributeOrders()}>
                  <RefreshCw className={`h-4 w-4 ${reattributing ? "animate-spin" : ""}`} />
                  {reattributing ? "重跑中…" : "重跑归因"}
                </Button>
                <Button size="sm" disabled={reconciling} onClick={() => void reconcileSettled()}>
                  <RefreshCw className={`h-4 w-4 ${reconciling ? "animate-spin" : ""}`} />
                  {reconciling ? "核对中…" : "核对已结算"}
                </Button>
              </div>
            }
          >
            <DataToolbar
              actions={
                <>
                  <Button size="sm" variant="outline" disabled={ordersLoading} onClick={() => void loadOrders(ordersPage)}>
                    <RefreshCw className={`h-4 w-4 ${ordersLoading ? "animate-spin" : ""}`} />
                    刷新
                  </Button>
                  <Button size="sm" variant="outline" disabled={exportingOrders || orders.total === 0} onClick={() => void exportAllOrders()}>
                    <Download className={`h-4 w-4 ${exportingOrders ? "animate-pulse" : ""}`} />
                    {exportingOrders ? "导出中…" : "导出"}
                  </Button>
                </>
              }
            >
              <SearchInput
                placeholder="搜索订单号、商品、归因用户"
                value={ordersSearch}
                onChange={(event) => setOrdersSearch(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") void loadOrders(1); }}
              />
              <FilterSelect
                aria-label="订单状态"
                value={ordersStatus}
                onChange={(event) => {
                  setOrdersStatus(event.target.value);
                  void loadOrders(1, event.target.value, ordersAttr);
                }}
              >
                <option value="">全部订单状态</option>
                <option value="paid">已付款</option>
                <option value="received">已收货</option>
                <option value="settled">已结算</option>
                <option value="refunded">已退款</option>
              </FilterSelect>
              <FilterSelect
                aria-label="归因状态"
                value={ordersAttr}
                onChange={(event) => {
                  setOrdersAttr(event.target.value);
                  void loadOrders(1, ordersStatus, event.target.value);
                }}
              >
                <option value="">全部归因状态</option>
                <option value="auto_matched">自动归因</option>
                <option value="manual_matched">人工归因</option>
                <option value="pending_review">待复核</option>
                <option value="unmatched">未归因</option>
              </FilterSelect>
              <Button size="sm" variant="outline" disabled={ordersLoading} onClick={() => void loadOrders(1)}>
                查询
              </Button>
              <ClearFiltersButton
                visible={Boolean(ordersSearch || ordersStatus || ordersAttr)}
                disabled={ordersLoading}
                onClick={() => {
                  setOrdersSearch("");
                  setOrdersStatus("");
                  setOrdersAttr("");
                  void loadOrders(1, "", "", "");
                }}
              />
            </DataToolbar>
            <Table className="min-w-[1180px]">
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
                {orders.items.length === 0 ? <EmptyRow colSpan={10} loading={ordersLoading} text={ordersLoading ? "加载中…" : "暂无订单数据"} /> : null}
              </TableBody>
            </Table>
            <TableFooter
              page={ordersPage}
              pageSize={50}
              total={orders.total}
              loading={ordersLoading}
              onPageChange={(page) => void loadOrders(page)}
            />
          </SectionCard>
          )}

          {activeNav === "conversions" && (
          <SectionCard
            id="conversions"
            title="查询历史"
            subtitle={`共 ${conversionsTotal} 条，可按商品、用户和平台定位查询记录`}
          >
            <DataToolbar>
              <SearchInput
                placeholder="搜索商品标题、itemId、昵称、OpenID"
                value={conversionsSearch}
                onChange={(event) => setConversionsSearch(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") void loadConversions(1); }}
              />
              <FilterSelect
                aria-label="平台"
                value={conversionsPlatform}
                onChange={(event) => {
                  setConversionsPlatform(event.target.value);
                  void loadConversions(1, conversionsSearch, event.target.value);
                }}
              >
                <option value="">全部平台</option>
                <option value="taobao">淘宝</option>
                <option value="jd">京东</option>
              </FilterSelect>
              <Button size="sm" variant="outline" disabled={conversionsLoading} onClick={() => void loadConversions(1)}>
                查询
              </Button>
              <ClearFiltersButton
                visible={Boolean(conversionsSearch || conversionsPlatform)}
                disabled={conversionsLoading}
                onClick={() => {
                  setConversionsSearch("");
                  setConversionsPlatform("");
                  void loadConversions(1, "", "");
                }}
              />
            </DataToolbar>
            <Table className="min-w-[860px]">
              <TableHeader>
                <TableRow>
                  <TableHead>用户</TableHead>
                  <TableHead>商品标题</TableHead>
                  <TableHead>itemId</TableHead>
                  <TableHead>平台</TableHead>
                  <TableHead className="text-right">预估返利</TableHead>
                  <TableHead>查询时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {conversions.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      <div>{c.userNickname || "未设置"}</div>
                      <div className="font-mono text-xs text-slate-400">{c.userId}</div>
                    </TableCell>
                    <TableCell className="max-w-72 truncate">{c.itemTitle}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-500">{c.itemId}</TableCell>
                    <TableCell>{c.platform}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(c.estimatedRebateCents)}</TableCell>
                    <TableCell className="text-xs text-slate-400">
                      {new Date(c.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </TableCell>
                  </TableRow>
                ))}
                {conversions.length === 0 ? <EmptyRow colSpan={6} loading={conversionsLoading} text={conversionsLoading ? "加载中…" : "暂无查询记录"} /> : null}
              </TableBody>
            </Table>
            <TableFooter
              page={conversionsPage}
              pageSize={50}
              total={conversionsTotal}
              loading={conversionsLoading}
              onPageChange={(page) => void loadConversions(page)}
            />
          </SectionCard>
          )}

          {activeNav === "attribution" && (
          <SectionCard
            id="attribution"
            title="订单归因复核"
            subtitle={`${filteredAttributions.length} 条结果，处理自动匹配不确定和未匹配的订单`}
          >
            <DataToolbar>
              <SearchInput
                placeholder="搜索商品、用户 ID、匹配原因"
                value={attributionSearch}
                onChange={(event) => {
                  setAttributionSearch(event.target.value);
                  setAttributionPage(1);
                }}
              />
              <FilterSelect
                aria-label="归因状态"
                value={attributionStatus}
                onChange={(event) => {
                  setAttributionStatus(event.target.value);
                  setAttributionPage(1);
                }}
              >
                <option value="">全部状态</option>
                <option value="pending_review">待复核</option>
                <option value="unmatched">未匹配</option>
              </FilterSelect>
              <ClearFiltersButton
                visible={Boolean(attributionSearch || attributionStatus)}
                onClick={() => {
                  setAttributionSearch("");
                  setAttributionStatus("");
                  setAttributionPage(1);
                }}
              />
            </DataToolbar>
            <Table className="min-w-[860px]">
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
                {pagedAttributions.map((row) => (
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
                {filteredAttributions.length === 0 ? <EmptyRow colSpan={6} text="没有符合条件的待复核订单" /> : null}
              </TableBody>
            </Table>
            <TableFooter
              page={attributionPage}
              pageSize={25}
              total={filteredAttributions.length}
              onPageChange={setAttributionPage}
            />
          </SectionCard>
          )}

          {activeNav === "claims" && (
          <SectionCard
            id="claims"
            title="订单申诉审核"
            subtitle={`${filteredClaims.length} 条结果，核对用户提交的漏单补充`}
          >
            <DataToolbar>
              <SearchInput
                placeholder="搜索 OpenID、订单后缀、备注"
                value={claimSearch}
                onChange={(event) => {
                  setClaimSearch(event.target.value);
                  setClaimPage(1);
                }}
              />
              <FilterSelect
                aria-label="申诉状态"
                value={claimStatus}
                onChange={(event) => {
                  setClaimStatus(event.target.value);
                  setClaimPage(1);
                }}
              >
                <option value="">全部状态</option>
                <option value="pending_review">待审核</option>
                <option value="approved">已通过</option>
                <option value="rejected">已驳回</option>
              </FilterSelect>
              <ClearFiltersButton
                visible={Boolean(claimSearch || claimStatus)}
                onClick={() => {
                  setClaimSearch("");
                  setClaimStatus("");
                  setClaimPage(1);
                }}
              />
            </DataToolbar>
            <Table className="min-w-[820px]">
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
                {pagedClaims.map((claim) => (
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
                {filteredClaims.length === 0 ? <EmptyRow colSpan={6} text="没有符合条件的申诉记录" /> : null}
              </TableBody>
            </Table>
            <TableFooter page={claimPage} pageSize={25} total={filteredClaims.length} onPageChange={setClaimPage} />
          </SectionCard>
          )}

          {activeNav === "withdrawals" && (
          <SectionCard
            id="withdrawals"
            title="提现审核"
            subtitle={`${filteredWithdrawals.length} 条结果，核对后打款或驳回`}
            headerRight={
              <Button
                size="sm"
                variant="outline"
                disabled={filteredWithdrawals.length === 0}
                onClick={() =>
                  downloadCsv(
                    "提现申请.csv",
                    ["用户", "OpenID", "金额(元)", "收款方式", "收款账号", "状态", "申请时间"],
                    filteredWithdrawals.map((w) => [
                      w.userNickname ?? w.userId,
                      w.userOpenid,
                      yuan(w.amountCents),
                      withdrawalPayTypeLabel(w.payType),
                      withdrawalPayAccount(w),
                      w.status,
                      new Date(w.createdAt).toLocaleString("zh-CN")
                    ])
                  )
                }
              >
                <Download className="h-4 w-4" /> 导出CSV
              </Button>
            }
          >
            <DataToolbar>
              <SearchInput
                placeholder="搜索用户、OpenID、收款账号、备注"
                value={withdrawalSearch}
                onChange={(event) => {
                  setWithdrawalSearch(event.target.value);
                  setWithdrawalPage(1);
                }}
              />
              <FilterSelect
                aria-label="提现状态"
                value={withdrawalStatus}
                onChange={(event) => {
                  setWithdrawalStatus(event.target.value);
                  setWithdrawalPage(1);
                }}
              >
                <option value="">全部状态</option>
                <option value="pending">待处理</option>
                <option value="paid">已打款</option>
                <option value="rejected">已驳回</option>
              </FilterSelect>
              <ClearFiltersButton
                visible={Boolean(withdrawalSearch || withdrawalStatus)}
                onClick={() => {
                  setWithdrawalSearch("");
                  setWithdrawalStatus("");
                  setWithdrawalPage(1);
                }}
              />
            </DataToolbar>
            <Table className="min-w-[1040px]">
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
                {pagedWithdrawals.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="font-medium">{w.userNickname || w.userOpenid.slice(0, 8) + "…"}</TableCell>
                    <TableCell className="font-semibold tabular-nums">{formatMoney(w.amountCents)}</TableCell>
                    <TableCell>{withdrawalPayTypeLabel(w.payType)}</TableCell>
                    <TableCell className="font-mono text-xs">{withdrawalPayAccount(w)}</TableCell>
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
                {filteredWithdrawals.length === 0 ? <EmptyRow colSpan={8} text="没有符合条件的提现申请" /> : null}
              </TableBody>
            </Table>
            <TableFooter
              page={withdrawalPage}
              pageSize={25}
              total={filteredWithdrawals.length}
              onPageChange={setWithdrawalPage}
            />
          </SectionCard>
          )}

          {activeNav === "settings" && (
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
            <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 md:p-5">
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
          )}

          {activeNav === "config" && (
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
              <div className="mb-3 flex flex-col gap-3 rounded-lg border border-indigo-100 bg-indigo-50/40 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
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
              <div className="mb-3 flex flex-col gap-3 rounded-lg border border-amber-100 bg-amber-50/40 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
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
              <div className="mb-3 flex flex-col gap-3 rounded-lg border border-amber-100 bg-amber-50/40 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-slate-500">订单 tab 开关（审核期间关闭，过审后开启）</div>
                  <div className="mt-1 text-sm font-medium text-slate-700">
                    当前：{data.config.ordersTabEnabled ? "已开启 · 小程序显示订单 tab" : "已关闭 · 小程序隐藏订单 tab"}
                  </div>
                </div>
                <Button
                  variant={data.config.ordersTabEnabled ? "danger" : "default"}
                  onClick={() => void toggleOrdersTab(!data.config.ordersTabEnabled)}
                >
                  {data.config.ordersTabEnabled ? "隐藏订单" : "显示订单"}
                </Button>
              </div>
              <div className="mb-3 flex flex-col gap-3 rounded-lg border border-emerald-100 bg-emerald-50/40 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-slate-500">新用户运动账号开关</div>
                  <div className="mt-1 text-sm font-medium text-slate-700">
                    当前：{data.config.sportsEnabled ? "已开启 · 新用户可绑定并使用目标服务" : "已关闭 · 新用户仅 AI 对话，已绑定用户和会员功能不受影响"}
                  </div>
                </div>
                <Button
                  variant={data.config.sportsEnabled ? "danger" : "default"}
                  onClick={() => void toggleSports(!data.config.sportsEnabled)}
                >
                  {data.config.sportsEnabled ? "暂停新用户" : "开放新用户"}
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {configItems.map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3.5">
                    <div className="text-xs font-medium text-slate-400">{label}</div>
                    <div className="mt-1 truncate text-sm font-medium text-slate-700">{value}</div>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>
          )}
        </section>
      </div>

      {userActionTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setUserActionTarget(null)}>
          <div className="w-full max-w-sm overflow-hidden rounded-xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div className="min-w-0">
                <h3 className="truncate font-semibold">{userActionTarget.nickname || "未设置昵称"}</h3>
                <p className="mt-0.5 truncate font-mono text-xs text-slate-400">{userActionTarget.id}</p>
              </div>
              <Button size="sm" variant="ghost" title="关闭" onClick={() => setUserActionTarget(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid gap-1 p-2">
              <button
                className="flex items-center justify-between px-3 py-3 text-left text-sm text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  openUserDetail(userActionTarget);
                  setUserActionTarget(null);
                }}
              >
                查看完整资料 <Eye className="h-4 w-4 text-slate-400" />
              </button>
              <button
                className="flex items-center justify-between px-3 py-3 text-left text-sm text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  setPointsModal({ userId: userActionTarget.id, nickname: userActionTarget.nickname ?? userActionTarget.id });
                  setPointsDelta("");
                  setUserActionTarget(null);
                }}
              >
                调整奖励值 <WalletCards className="h-4 w-4 text-slate-400" />
              </button>
              <button
                className="flex items-center justify-between px-3 py-3 text-left text-sm text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  setRatioModal({ userId: userActionTarget.id, nickname: userActionTarget.nickname ?? userActionTarget.id });
                  setRatioInput(userActionTarget.rebateRatio != null ? String(Math.round(userActionTarget.rebateRatio * 100)) : "");
                  setUserActionTarget(null);
                }}
              >
                设置返利比例 <Settings className="h-4 w-4 text-slate-400" />
              </button>
              <button
                className={`flex items-center justify-between px-3 py-3 text-left text-sm hover:bg-slate-50 ${
                  userActionTarget.status === "banned" ? "text-emerald-700" : "text-amber-700"
                }`}
                onClick={() => {
                  const user = userActionTarget;
                  setUserActionTarget(null);
                  void setUserStatus(user.id, user.status === "banned" ? "active" : "banned");
                }}
              >
                {userActionTarget.status === "banned" ? "解除封禁" : "封禁用户"}
                <ShieldQuestion className="h-4 w-4" />
              </button>
              <button
                className="flex items-center justify-between px-3 py-3 text-left text-sm text-rose-600 hover:bg-rose-50"
                onClick={() => {
                  const user = userActionTarget;
                  setUserActionTarget(null);
                  void deleteUser(user.id, user.nickname ?? user.id);
                }}
              >
                删除用户 <XCircle className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pointsModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPointsModal(null)}>
          <div className="w-full max-w-80 rounded-xl bg-white p-5 shadow-2xl sm:p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold">调整奖励值</h3>
            <p className="mt-1 text-sm text-slate-500">用户：{pointsModal.nickname}</p>
            <input
              autoFocus
              className="mt-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
              placeholder="奖励值，1 奖励值对应 1 元（如 -5）"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setRatioModal(null)}>
          <div className="w-full max-w-80 rounded-xl bg-white p-5 shadow-2xl sm:p-6" onClick={(e) => e.stopPropagation()}>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-6" onClick={() => setDownlineModal(null)}>
          <div className="max-h-[80vh] w-full max-w-[34rem] overflow-hidden rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
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
                    <EmptyRow colSpan={3} loading text="加载中…" />
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

      {userDetailTarget ? (
        <UserDetailModal
          target={userDetailTarget}
          detail={userDetail}
          loading={userDetailLoading}
          onClose={closeUserDetail}
          onRefresh={() =>
            void loadUserDetail(
              userDetailTarget.id,
              userDetail?.orders.page ?? 1,
              userDetail?.downlines.page ?? 1
            )
          }
          onOrderPage={(page) =>
            void loadUserDetail(userDetailTarget.id, page, userDetail?.downlines.page ?? 1)
          }
          onDownlinePage={(page) =>
            void loadUserDetail(userDetailTarget.id, userDetail?.orders.page ?? 1, page)
          }
        />
      ) : null}
    </main>
  );
}

function UserDetailModal({
  target,
  detail,
  loading,
  onClose,
  onRefresh,
  onOrderPage,
  onDownlinePage
}: {
  target: { id: string; nickname: string };
  detail: AdminUserDetail | null;
  loading: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onOrderPage: (page: number) => void;
  onDownlinePage: (page: number) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3 sm:p-6" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-[96vw] max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <h3 className="truncate font-semibold">用户详情 · {detail?.user.nickname || target.nickname}</h3>
            <p className="mt-0.5 truncate font-mono text-xs text-slate-400">{target.id}</p>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" disabled={loading} onClick={onRefresh} title="刷新">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose} title="关闭">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && !detail ? (
            <div className="flex min-h-80 items-center justify-center gap-2 text-sm text-slate-400">
              <RefreshCw className="h-5 w-5 animate-spin" />
              加载用户资料…
            </div>
          ) : detail ? (
            <>
              <div className="grid grid-cols-2 border-b border-slate-200 sm:grid-cols-4">
                <DetailMetric label="可用奖励值" value={formatRewardValue(detail.balance.availableCents)} />
                <DetailMetric label="订单已到账" value={formatRewardValue(detail.balance.settledCents)} />
                <DetailMetric label="待结算奖励值" value={formatRewardValue(detail.balance.pendingCents)} />
                <DetailMetric label="直接下线" value={`${detail.downlines.total} 人`} />
              </div>

              <section className="border-b border-slate-200 px-4 py-5 sm:px-6">
                <h4 className="text-sm font-semibold text-slate-800">账户信息</h4>
                <dl className="mt-3 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  <DetailField label="昵称" value={detail.user.nickname || "未设置"} />
                  <DetailField label="状态" value={detail.user.status === "banned" ? "已封禁" : "正常"} />
                  <DetailField label="注册时间" value={new Date(detail.user.createdAt).toLocaleString("zh-CN")} />
                  <DetailField label="OpenID" value={detail.user.openid} mono />
                  <DetailField label="UnionID" value={detail.user.unionid || "—"} mono />
                  <DetailField
                    label="上级"
                    value={detail.user.inviter?.nickname || detail.user.inviter?.openid || "无"}
                  />
                  <DetailField
                    label="返利比例"
                    value={detail.user.rebateRatio == null ? "使用全局比例" : `${Math.round(detail.user.rebateRatio * 100)}%`}
                  />
                  <DetailField
                    label="下线提成"
                    value={`已到账 ${formatRewardValue(detail.referral.earnedCents)} · 待结算 ${formatRewardValue(detail.referral.pendingCents)}`}
                  />
                  <DetailField label="提现申请" value={`${detail.withdrawals.total} 笔`} />
                </dl>
              </section>

              <DetailTableHeader
                title="订单"
                total={detail.orders.total}
                page={detail.orders.page}
                pageSize={detail.orders.pageSize}
                loading={loading}
                onPage={onOrderPage}
              />
              <div className="overflow-x-auto border-b border-slate-200">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>订单号</TableHead>
                      <TableHead>商品</TableHead>
                      <TableHead>付款时间</TableHead>
                      <TableHead>实付</TableHead>
                      <TableHead>奖励值</TableHead>
                      <TableHead>状态</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.orders.items.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-mono text-xs">{order.orderNumber}</TableCell>
                        <TableCell className="max-w-72 truncate">{order.itemTitle}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-slate-500">
                          {new Date(order.payTime).toLocaleString("zh-CN")}
                        </TableCell>
                        <TableCell className="tabular-nums">{formatMoney(order.payAmountCents)}</TableCell>
                        <TableCell className="tabular-nums">{formatRewardValue(order.userRebateCents)}</TableCell>
                        <TableCell><Badge variant={rebateBadgeVariant(order.rebateStatus)}>{rebateStatusLabel(order.rebateStatus)}</Badge></TableCell>
                      </TableRow>
                    ))}
                    {detail.orders.items.length === 0 ? <EmptyRow colSpan={6} text="暂无订单" /> : null}
                  </TableBody>
                </Table>
              </div>

              <DetailTableHeader
                title="直接下线"
                total={detail.downlines.total}
                page={detail.downlines.page}
                pageSize={detail.downlines.pageSize}
                loading={loading}
                onPage={onDownlinePage}
              />
              <div className="overflow-x-auto border-b border-slate-200">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>昵称</TableHead>
                      <TableHead>OpenID</TableHead>
                      <TableHead>加入时间</TableHead>
                      <TableHead className="text-right">贡献奖励值</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.downlines.items.map((downline) => (
                      <TableRow key={downline.id}>
                        <TableCell className="font-medium">{downline.nickname || "未设置"}</TableCell>
                        <TableCell className="font-mono text-xs text-slate-500">{downline.openid}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-slate-500">
                          {new Date(downline.createdAt).toLocaleString("zh-CN")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatRewardValue(downline.contributedCents)}</TableCell>
                      </TableRow>
                    ))}
                    {detail.downlines.items.length === 0 ? <EmptyRow colSpan={4} text="暂无下线" /> : null}
                  </TableBody>
                </Table>
              </div>

              <div className="px-4 py-4 sm:px-6">
                <h4 className="text-sm font-semibold text-slate-800">最近提现</h4>
                <p className="mt-0.5 text-xs text-slate-400">显示最近 20 笔，共 {detail.withdrawals.total} 笔</p>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>时间</TableHead>
                      <TableHead>奖励值</TableHead>
                      <TableHead>状态</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.withdrawals.items.map((withdrawal) => (
                      <TableRow key={withdrawal.id}>
                        <TableCell className="text-xs text-slate-500">
                          {new Date(withdrawal.createdAt).toLocaleString("zh-CN")}
                        </TableCell>
                        <TableCell className="tabular-nums">{formatRewardValue(withdrawal.amountCents)}</TableCell>
                        <TableCell>{withdrawalStatusLabel(withdrawal.status)}</TableCell>
                      </TableRow>
                    ))}
                    {detail.withdrawals.items.length === 0 ? <EmptyRow colSpan={3} text="暂无提现记录" /> : null}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : (
            <div className="flex min-h-80 items-center justify-center text-sm text-slate-400">用户详情加载失败</div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-r border-slate-100 px-4 py-4 last:border-r-0 sm:px-6">
      <div className="truncate text-xs text-slate-400">{label}</div>
      <div className="mt-1 truncate text-xl font-semibold tabular-nums text-slate-800">{value}</div>
    </div>
  );
}

function DetailField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className={`mt-0.5 break-all text-slate-700 ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}

function DetailTableHeader({
  title,
  total,
  page,
  pageSize,
  loading,
  onPage
}: {
  title: string;
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  onPage: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6">
      <div>
        <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
        <p className="mt-0.5 text-xs text-slate-400">共 {total} 条</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button size="sm" variant="ghost" disabled={page <= 1 || loading} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-16 text-center text-xs text-slate-500">{page} / {totalPages}</span>
        <Button size="sm" variant="ghost" disabled={page >= totalPages || loading} onClick={() => onPage(page + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
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
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>
        </div>
        {headerRight ? <div className="flex shrink-0 flex-wrap items-center gap-2">{headerRight}</div> : null}
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
  highlight = false,
  onClick
}: {
  icon?: React.ReactNode;
  label: string;
  value: number;
  note: string;
  highlight?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-xl border bg-white p-4 shadow-sm shadow-slate-200/40 transition-colors ${
        highlight ? "border-amber-200 bg-amber-50/40" : "border-slate-200/80"
      } ${onClick ? "cursor-pointer hover:border-emerald-300 hover:shadow-md" : ""}`}
    >
      <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${highlight ? "bg-amber-100 text-amber-600" : "bg-emerald-50 text-emerald-600"}`}>
          {icon}
        </span>
        {label}
      </div>
      <div className="mt-3 text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-0.5 text-xs text-slate-400">{note}{onClick ? " ›" : ""}</div>
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

  // 静默卡死不会有失败记录，只能靠「最新记录距今过久」判断。
  // 阈值取 max(3×间隔, 15min)：短间隔(如2min)下单轮同步可能跑超间隔、防重入会跳tick，
  // 用过紧的 2×间隔会误报"已停止"，故设 15min 下限。
  const staleMinutes = Math.max(intervalMinutes * 3, 15);
  const stale =
    latest != null && Date.now() - new Date(latest.createdAt).getTime() > staleMinutes * 60 * 1000;

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
                已超过 {staleMinutes} 分钟没有新同步记录，定时任务可能已停止，请检查服务。
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

function EmptyRow({ colSpan, text, loading = false }: { colSpan: number; text: string; loading?: boolean }) {
  return (
    <TableRow>
      <TableCell className="py-12 text-center" colSpan={colSpan}>
        <div className="flex flex-col items-center gap-2 text-slate-400">
          {loading ? (
            <RefreshCw className="h-6 w-6 animate-spin" />
          ) : (
            <Inbox className="h-7 w-7 text-slate-300" />
          )}
          <span className="text-sm">{text}</span>
        </div>
      </TableCell>
    </TableRow>
  );
}

function formatRewardValue(amountCents: number): string {
  const value = amountCents / 100;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function rebateStatusLabel(status: AdminUserDetail["orders"]["items"][number]["rebateStatus"]): string {
  return {
    available: "已到账",
    pending: "待结算",
    reversed: "已冲销",
    none: "未入账"
  }[status];
}

function rebateBadgeVariant(
  status: AdminUserDetail["orders"]["items"][number]["rebateStatus"]
): "secondary" | "warning" | "success" | "danger" {
  if (status === "available") return "success";
  if (status === "pending") return "warning";
  if (status === "reversed") return "danger";
  return "secondary";
}

function withdrawalPayTypeLabel(payType: string): string {
  if (payType === "alipay") return "支付宝";
  if (payType === "wechat") return "微信";
  if (payType === "redpacket") return "微信红包";
  return payType || "未填写";
}

function withdrawalPayAccount(withdrawal: AdminWithdrawal): string {
  if (withdrawal.payAccount) return withdrawal.payAccount;
  if (withdrawal.payType === "redpacket") return withdrawal.userOpenid || "未填写";
  return "未填写";
}

function withdrawalStatusLabel(status: string): string {
  return {
    pending: "待处理",
    paid: "已发放",
    rejected: "已驳回"
  }[status] ?? status;
}

function formatMoney(amountCents: number) {
  return `¥${(amountCents / 100).toFixed(2)}`;
}

function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  // BOM 让 Excel 正确识别中文
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function yuan(cents: number | null) {
  return cents == null ? "" : (cents / 100).toFixed(2);
}
