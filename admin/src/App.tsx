import {
  Check,
  ClipboardCheck,
  Copy,
  LayoutDashboard,
  LogOut,
  Megaphone,
  RefreshCw,
  Settings,
  ShieldQuestion,
  Users,
  WalletCards
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
  type AdminOverview,
  type AdminUser,
  type PendingAttribution
} from "./lib/api";
import { toast } from "./lib/toast";

type AdminData = {
  overview: AdminOverview;
  users: AdminUser[];
  config: AdminConfig["config"];
  pendingAttributions: PendingAttribution[];
  claims: AdminClaim[];
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
    dingdanxiaPid: "",
    commissionSharingRatio: 0,
    attributionWindowHours: 24,
    highValueReviewThresholdCents: 5000
  },
  pendingAttributions: [],
  claims: []
};

const NAV_ITEMS = [
  { id: "overview", label: "概览", icon: LayoutDashboard },
  { id: "deals", label: "线报管理", icon: Megaphone },
  { id: "users", label: "用户", icon: Users },
  { id: "attribution", label: "订单复核", icon: ClipboardCheck },
  { id: "claims", label: "申诉审核", icon: ShieldQuestion },
  { id: "config", label: "配置", icon: Settings }
];

export function App() {
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem("dabai-admin-token") ?? "");
  const [tokenInput, setTokenInput] = useState("");
  const [authed, setAuthed] = useState(false);
  const [data, setData] = useState<AdminData>(emptyData);
  const [loading, setLoading] = useState(false);
  const [activeNav, setActiveNav] = useState("overview");

  const configItems = useMemo(
    () => [
      ["订单侠 PID", data.config.dingdanxiaPid || "未配置"],
      ["用户分成比例", `${Math.round(data.config.commissionSharingRatio * 100)}%`],
      ["自动归因窗口", `复制后 ${data.config.attributionWindowHours} 小时`],
      ["高额复核阈值", formatMoney(data.config.highValueReviewThresholdCents)],
      ["API 地址", apiBaseUrl]
    ],
    [data]
  );

  async function loadData(token = adminToken, options: { silent?: boolean } = {}) {
    if (!token.trim()) return false;

    setLoading(true);
    try {
      const [overview, usersResponse, configResponse, pendingResponse, claimsResponse] = await Promise.all([
        fetchAdminApi<AdminOverview>("/api/admin/overview", token),
        fetchAdminApi<{ users: AdminUser[] }>("/api/admin/users", token),
        fetchAdminApi<AdminConfig>("/api/admin/config", token),
        fetchAdminApi<{ items: PendingAttribution[] }>("/api/admin/pending-attributions", token),
        fetchAdminApi<{ claims: AdminClaim[] }>("/api/admin/claims", token)
      ]);
      setData({
        overview,
        users: usersResponse.users,
        config: configResponse.config,
        pendingAttributions: pendingResponse.items,
        claims: claimsResponse.claims
      });
      localStorage.setItem("dabai-admin-token", token);
      setAdminToken(token);
      setAuthed(true);
      if (!options.silent) toast("数据已刷新");
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
          <h1 className="mt-5 text-xl font-semibold text-slate-900">大白小助手 · 运营后台</h1>
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
              <div className="text-sm font-semibold leading-tight">大白小助手</div>
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
            <Button disabled={loading} variant="outline" onClick={() => void loadData()}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              刷新
            </Button>
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
                      <Badge variant={user.status === "banned" ? "danger" : "success"}>
                        {user.status === "banned" ? "已封禁" : "正常"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {user.status === "banned" ? (
                        <Button size="sm" variant="outline" onClick={() => void setUserStatus(user.id, "active")}>
                          解封
                        </Button>
                      ) : (
                        <Button size="sm" variant="danger" onClick={() => void setUserStatus(user.id, "banned")}>
                          封禁
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {data.users.length === 0 ? <EmptyRow colSpan={8} text="暂无用户数据" /> : null}
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

          <SectionCard id="config" title="系统配置" subtitle="当前生产关键配置（只读）">
            <div className="grid grid-cols-2 gap-3 p-5">
              {configItems.map(([label, value]) => (
                <div key={label} className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3.5">
                  <div className="text-xs font-medium text-slate-400">{label}</div>
                  <div className="mt-1 truncate text-sm font-medium text-slate-700">{value}</div>
                </div>
              ))}
            </div>
          </SectionCard>
        </section>
      </div>
    </main>
  );
}

function SectionCard({
  id,
  title,
  subtitle,
  children
}: {
  id: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-5 scroll-mt-6 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>
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
