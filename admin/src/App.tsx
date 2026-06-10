import { Check, RefreshCw, Settings, Users, WalletCards } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "./components/ui/badge";
import { DealManager } from "./DealManager";
import { Button } from "./components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./components/ui/table";
import {
  fetchAdminApi,
  type AdminClaim,
  type AdminConfig,
  type AdminOverview,
  type AdminUser,
  type PendingAttribution
} from "./lib/api";

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

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

export function App() {
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem("dabai-admin-token") ?? "");
  const [data, setData] = useState<AdminData>(emptyData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const configItems = useMemo(
    () => [
      ["订单侠 PID", data.config.dingdanxiaPid || "未配置"],
      ["用户分佣比例", `${Math.round(data.config.commissionSharingRatio * 100)}%`],
      ["自动归因窗口", `复制后 ${data.config.attributionWindowHours} 小时`],
      ["高佣复核阈值", formatMoney(data.config.highValueReviewThresholdCents)],
      ["待补充记录", `${data.overview.metrics.orderClaimCount} 条`]
    ],
    [data]
  );

  async function loadData(token = adminToken) {
    if (!token.trim()) {
      setError("请输入管理员 Token");
      return;
    }

    setLoading(true);
    setError("");
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
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "后台数据加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function approveAttribution(id: string, userId: string | null) {
    await fetchAdminApi(`/api/admin/orders/${id}/attribute`, adminToken, {
      method: "POST",
      body: JSON.stringify({ userId })
    });
    await loadData();
  }

  async function setUserStatus(id: string, status: "active" | "banned") {
    await fetchAdminApi(`/api/admin/users/${id}/status`, adminToken, {
      method: "POST",
      body: JSON.stringify({ status })
    });
    await loadData();
  }

  async function reviewClaim(id: string, status: "approved" | "rejected") {
    await fetchAdminApi(`/api/admin/claims/${id}/review`, adminToken, {
      method: "POST",
      body: JSON.stringify({ status })
    });
    await loadData();
  }

  useEffect(() => {
    if (adminToken) {
      void loadData(adminToken);
    }
  }, []);

  const metrics = data.overview.metrics;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="grid min-h-screen grid-cols-[240px_1fr]">
        <aside className="border-r border-slate-200 bg-white px-4 py-6">
          <div className="px-3">
            <div className="text-lg font-semibold">大白小助手后台</div>
            <div className="mt-1 text-xs text-slate-500">用户、订单和配置</div>
          </div>
          <nav className="mt-8 flex flex-col gap-1">
            <a className="rounded-md bg-slate-100 px-3 py-2 text-sm font-medium" href="#overview">
              概览
            </a>
            <a className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-50" href="#users">
              用户
            </a>
            <a className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-50" href="#attribution">
              订单复核
            </a>
            <a className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-50" href="#claims">
              申诉审核
            </a>
            <a className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-50" href="#deals">
              线报管理
            </a>
            <a className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-50" href="#config">
              配置
            </a>
          </nav>
        </aside>

        <section className="px-8 py-8">
          <header className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">运营控制台</h1>
              <p className="mt-2 text-sm text-slate-500">查看用户、推广规模、待复核订单和核心配置。</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                className="h-10 w-64 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
                placeholder="管理员 Token"
                type="password"
                value={adminToken}
                onChange={(event) => setAdminToken(event.target.value)}
              />
              <Button disabled={loading} variant="outline" onClick={() => void loadData()}>
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                刷新
              </Button>
            </div>
          </header>

          {error ? <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

          <section id="overview" className="mt-6 grid grid-cols-5 gap-4">
            <MetricCard icon={<Users className="h-4 w-4" />} label="用户数" value={metrics.userCount} note="小程序注册用户" />
            <MetricCard icon={<WalletCards className="h-4 w-4" />} label="转化数" value={metrics.conversionCount} note="累计生成内容" />
            <MetricCard label="复制事件" value={metrics.copyEventCount} note="用于订单归因" />
            <MetricCard label="待复核" value={metrics.pendingAttributionCount} note="需要人工判断" />
            <MetricCard label="补充记录" value={metrics.orderClaimCount} note="用户提交订单线索" />
          </section>

          <section id="users" className="mt-6 rounded-lg border border-slate-200 bg-white">
            <SectionTitle title="用户" subtitle="普通用户、转化次数、复制次数和订单补充记录。" />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>昵称</TableHead>
                  <TableHead>用户 ID</TableHead>
                  <TableHead>OpenID</TableHead>
                  <TableHead>转化数</TableHead>
                  <TableHead>复制数</TableHead>
                  <TableHead>补充记录</TableHead>
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
                          <img
                            alt=""
                            className="h-7 w-7 rounded-full object-cover"
                            src={user.avatarUrl.startsWith("/") ? `${apiBaseUrl}${user.avatarUrl}` : user.avatarUrl}
                          />
                        ) : null}
                        {user.nickname || "未设置"}
                      </span>
                    </TableCell>
                    <TableCell>{user.id}</TableCell>
                    <TableCell>{user.openid}</TableCell>
                    <TableCell>{user.conversionCount}</TableCell>
                    <TableCell>{user.copyEventCount}</TableCell>
                    <TableCell>{user.claimCount}</TableCell>
                    <TableCell>
                      <Badge variant={user.status === "banned" ? "warning" : "secondary"}>
                        {user.status === "banned" ? "已封禁" : "正常"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {user.status === "banned" ? (
                        <Button size="sm" variant="outline" onClick={() => void setUserStatus(user.id, "active")}>
                          解封
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => void setUserStatus(user.id, "banned")}>
                          封禁
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {data.users.length === 0 ? <EmptyRow colSpan={8} text="暂无用户数据" /> : null}
              </TableBody>
            </Table>
          </section>

          <section id="attribution" className="mt-6 rounded-lg border border-slate-200 bg-white">
            <SectionTitle title="订单归因复核" subtitle="处理自动匹配不确定和未匹配订单。" />
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
                    <TableCell className="font-medium">{row.order.itemTitle}</TableCell>
                    <TableCell>{row.userId ?? "未匹配"}</TableCell>
                    <TableCell>
                      <Badge variant={row.confidence >= 0.5 ? "warning" : "secondary"}>
                        {(row.confidence * 100).toFixed(0)}%
                      </Badge>
                    </TableCell>
                    <TableCell>{row.reason}</TableCell>
                    <TableCell>{formatMoney(row.order.estimatedCommissionCents)}</TableCell>
                    <TableCell className="flex justify-end gap-2">
                      <Button size="sm" disabled={!row.userId} onClick={() => void approveAttribution(row.id, row.userId)}>
                        <Check className="h-4 w-4" />
                        通过
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {data.pendingAttributions.length === 0 ? <EmptyRow colSpan={6} text="暂无待复核订单" /> : null}
              </TableBody>
            </Table>
          </section>

          <section id="claims" className="mt-6 rounded-lg border border-slate-200 bg-white">
            <SectionTitle title="订单申诉审核" subtitle="用户提交的漏单补充记录，核对后通过或驳回。" />
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
                    <TableCell className="font-medium">{claim.userOpenid}</TableCell>
                    <TableCell>{claim.orderSuffix}</TableCell>
                    <TableCell className="max-w-56 truncate">{claim.notes || "—"}</TableCell>
                    <TableCell>
                      {claim.screenshotUrl ? (
                        <a
                          className="text-sm text-blue-600 underline"
                          href={claim.screenshotUrl.startsWith("/") ? `${apiBaseUrl}${claim.screenshotUrl}` : claim.screenshotUrl}
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
                          claim.status === "approved" ? "secondary" : claim.status === "rejected" ? "warning" : "secondary"
                        }
                      >
                        {claim.status === "pending_review" ? "待审核" : claim.status === "approved" ? "已通过" : "已驳回"}
                      </Badge>
                    </TableCell>
                    <TableCell className="flex justify-end gap-2">
                      {claim.status === "pending_review" ? (
                        <>
                          <Button size="sm" onClick={() => void reviewClaim(claim.id, "approved")}>
                            <Check className="h-4 w-4" />
                            通过
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => void reviewClaim(claim.id, "rejected")}>
                            驳回
                          </Button>
                        </>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
                {data.claims.length === 0 ? <EmptyRow colSpan={6} text="暂无申诉记录" /> : null}
              </TableBody>
            </Table>
          </section>

          <DealManager adminToken={adminToken} />

          <section id="config" className="mt-6 rounded-lg border border-slate-200 bg-white">
            <SectionTitle title="系统配置" subtitle="当前生产关键配置只读展示。" />
            <div className="grid grid-cols-2 gap-4 p-4">
              {configItems.map(([label, value]) => (
                <div key={label} className="rounded-md border border-slate-200 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Settings className="h-4 w-4 text-slate-500" />
                    {label}
                  </div>
                  <div className="mt-2 text-sm text-slate-600">{value}</div>
                </div>
              ))}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="border-b border-slate-200 px-4 py-4">
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  note
}: {
  icon?: React.ReactNode;
  label: string;
  value: number;
  note: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        {icon}
        {label}
      </div>
      <div className="mt-3 text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{note}</div>
    </div>
  );
}

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <TableRow>
      <TableCell className="py-8 text-center text-sm text-slate-500" colSpan={colSpan}>
        {text}
      </TableCell>
    </TableRow>
  );
}

function formatMoney(amountCents: number) {
  return `¥${(amountCents / 100).toFixed(2)}`;
}
