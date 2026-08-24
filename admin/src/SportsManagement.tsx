import { Copy, Download, KeyRound, RefreshCw, RotateCcw, ShieldCheck, UserRoundX } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { DataToolbar, FilterSelect, SearchInput, TableFooter } from "./components/ui/data-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./components/ui/table";
import { fetchAdminApi } from "./lib/api";
import { toast } from "./lib/toast";

type SportsUser = {
  id: string;
  openid: string;
  nickname: string | null;
  avatarUrl: string | null;
  userStatus: string;
  createdAt: string;
  account: {
    email: string;
    status: string;
    bindStatus: string;
    membershipExpiresAt: string | null;
    updatedAt: string;
  } | null;
  todayTargetSteps: number | null;
};

type AccessCode = {
  id: string;
  code: string | null;
  codeHint: string;
  batchId: string;
  durationDays: number;
  status: string;
  effectiveStatus: string;
  validUntil: string | null;
  redeemedByUserId: string | null;
  redeemedByNickname?: string | null;
  redeemedAt: string | null;
  createdAt: string;
};

export function SportsUserManager({ adminToken }: { adminToken: string }) {
  const [items, setItems] = useState<SportsUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [bindStatus, setBindStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [unbindingId, setUnbindingId] = useState("");

  async function load(nextPage = page, nextSearch = search, nextStatus = bindStatus) {
    setLoading(true);
    try {
      const query = new URLSearchParams({ page: String(nextPage), pageSize: "50" });
      if (nextSearch.trim()) query.set("search", nextSearch.trim());
      if (nextStatus) query.set("bindStatus", nextStatus);
      const result = await fetchAdminApi<{ total: number; items: SportsUser[] }>(
        `/api/admin/sports/users?${query.toString()}`,
        adminToken
      );
      setItems(result.items);
      setTotal(result.total);
      setPage(nextPage);
    } catch {
      toast("步数用户加载失败", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(1); }, []);

  async function unbind(user: SportsUser) {
    const label = user.nickname || user.account?.email || user.openid.slice(0, 8);
    if (!window.confirm(`确认解除「${label}」的 Zepp Life 绑定？\n\n用户需要重新扫码绑定；账号资料和会员有效期会保留。`)) return;
    setUnbindingId(user.id);
    try {
      await fetchAdminApi(`/api/admin/sports/users/${user.id}/unbind`, adminToken, { method: "POST", body: "{}" });
      toast("已解除绑定，用户可重新发起扫码绑定");
      await load(page);
    } catch {
      toast("解绑失败，请稍后重试", "error");
    } finally {
      setUnbindingId("");
    }
  }

  return (
    <ManagerCard title="步数用户" subtitle={`共 ${total} 位用户，可查看绑定、会员和今日目标状态`}>
      <DataToolbar actions={<Button size="sm" variant="outline" disabled={loading} onClick={() => void load(page)}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />刷新</Button>}>
        <SearchInput
          aria-label="搜索步数用户"
          placeholder="搜索昵称、OpenID、用户 ID 或 Zepp 邮箱…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") void load(1); }}
        />
        <FilterSelect aria-label="绑定状态" value={bindStatus} onChange={(event) => { setBindStatus(event.target.value); void load(1, search, event.target.value); }}>
          <option value="">全部绑定状态</option>
          <option value="bound">已绑定</option>
          <option value="unbound">待绑定</option>
          <option value="none">未创建账号</option>
        </FilterSelect>
      </DataToolbar>
      <Table>
        <TableHeader><TableRow>
          <TableHead>用户</TableHead><TableHead>Zepp Life 账号</TableHead><TableHead>绑定状态</TableHead>
          <TableHead>会员有效期</TableHead><TableHead className="text-right">今日目标</TableHead><TableHead className="text-right">操作</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {items.map((user) => {
            const expired = user.account?.membershipExpiresAt ? new Date(user.account.membershipExpiresAt).getTime() <= Date.now() : true;
            return <TableRow key={user.id}>
              <TableCell>
                <div className="flex min-w-44 items-center gap-2.5">
                  {user.avatarUrl ? <img className="h-8 w-8 rounded-full object-cover" src={user.avatarUrl} alt="" width={32} height={32} /> : <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs text-slate-500">{(user.nickname || "用").slice(0, 1)}</div>}
                  <div className="min-w-0"><div className="truncate font-medium text-slate-800">{user.nickname || "未设置昵称"}</div><div className="mt-0.5 max-w-52 truncate font-mono text-[11px] text-slate-400">{user.openid}</div></div>
                </div>
              </TableCell>
              <TableCell className="font-mono text-xs">{user.account?.email || "—"}</TableCell>
              <TableCell><BindingBadge account={user.account} /></TableCell>
              <TableCell>{user.account?.membershipExpiresAt ? <div><span className={`tabular-nums ${expired ? "text-rose-600" : "text-slate-700"}`}>{formatDate(user.account.membershipExpiresAt)}</span><div className="mt-0.5 text-[11px] text-slate-400">{expired ? "已到期" : remainingDays(user.account.membershipExpiresAt)}</div></div> : <span className="text-slate-400">—</span>}</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">{user.todayTargetSteps === null ? <span className="font-normal text-slate-400">未设置</span> : `${user.todayTargetSteps.toLocaleString("zh-CN")} 步`}</TableCell>
              <TableCell className="text-right">
                {user.account?.bindStatus === "bound" ? <Button size="sm" variant="danger" disabled={unbindingId === user.id} onClick={() => void unbind(user)}><UserRoundX className="h-4 w-4" />{unbindingId === user.id ? "解绑中…" : "解除绑定"}</Button> : <span className="text-xs text-slate-400">无需操作</span>}
              </TableCell>
            </TableRow>;
          })}
          {!loading && items.length === 0 ? <TableRow><TableCell colSpan={6} className="py-12 text-center text-sm text-slate-400">没有符合条件的用户，请调整搜索或筛选条件。</TableCell></TableRow> : null}
        </TableBody>
      </Table>
      <TableFooter page={page} pageSize={50} total={total} loading={loading} onPageChange={(next) => void load(next)} />
    </ManagerCard>
  );
}

export function SportsCodeManager({ adminToken }: { adminToken: string }) {
  const [items, setItems] = useState<AccessCode[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [count, setCount] = useState("10");
  const [durationDays, setDurationDays] = useState("30");
  const [validUntil, setValidUntil] = useState("");
  const [createdCodes, setCreatedCodes] = useState<string[]>([]);
  const [createdBatchId, setCreatedBatchId] = useState("");

  async function load(nextPage = page, nextStatus = status, nextSearch = search) {
    setLoading(true);
    try {
      const query = new URLSearchParams({ page: String(nextPage), pageSize: "50" });
      if (nextStatus) query.set("status", nextStatus);
      if (nextSearch.trim()) query.set("search", nextSearch.trim());
      const result = await fetchAdminApi<{ total: number; items: AccessCode[] }>(`/api/admin/sports/access-codes?${query}`, adminToken);
      setItems(result.items); setTotal(result.total); setPage(nextPage);
    } catch { toast("卡密列表加载失败", "error"); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(1); }, []);

  async function generate() {
    const amount = Number(count);
    const days = Number(durationDays);
    if (!Number.isInteger(amount) || amount < 1 || amount > 100) return toast("单次生成数量为 1–100 个", "error");
    if (!Number.isInteger(days) || days < 1 || days > 3650) return toast("会员时长为 1–3650 天", "error");
    setGenerating(true);
    try {
      const result = await fetchAdminApi<{ batchId: string; codes: Array<{ code: string }> }>("/api/admin/sports/access-codes/generate", adminToken, {
        method: "POST",
        body: JSON.stringify({ count: amount, durationDays: days, validUntil: validUntil ? new Date(`${validUntil}T23:59:59+08:00`).toISOString() : null })
      });
      setCreatedCodes(result.codes.map((item) => item.code));
      setCreatedBatchId(result.batchId);
      toast(`已生成 ${result.codes.length} 个卡密`);
      await load(1);
    } catch { toast("卡密生成失败，请检查参数后重试", "error"); }
    finally { setGenerating(false); }
  }

  async function revoke(code: AccessCode) {
    if (!window.confirm(`确认撤销卡密「${code.codeHint}」？撤销后不可兑换。`)) return;
    try {
      await fetchAdminApi(`/api/admin/sports/access-codes/${code.id}/revoke`, adminToken, { method: "POST", body: "{}" });
      toast("卡密已撤销"); await load(page);
    } catch { toast("撤销失败，卡密可能已被使用", "error"); }
  }

  async function copyCreated() {
    await navigator.clipboard.writeText(createdCodes.join("\n"));
    toast(`已复制 ${createdCodes.length} 个卡密`);
  }

  function downloadCreated() {
    const blob = new Blob([createdCodes.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = `步数卡密_${createdBatchId.slice(0, 8)}.txt`; link.click(); URL.revokeObjectURL(url);
  }

  return <div className="mt-6 space-y-4">
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-200/40">
      <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-end">
        <div className="mr-auto max-w-md"><div className="flex items-center gap-2 text-base font-semibold"><KeyRound className="h-5 w-5 text-emerald-600" />生成卡密</div><p className="mt-1 text-sm leading-6 text-slate-500">兑换后从当前有效期继续增加时长；完整卡密会保存在后台，之后仍可查看。</p></div>
        <label className="w-full text-xs font-medium text-slate-500 lg:w-auto">生成数量<input aria-label="生成数量" className="mt-1 block h-9 w-full rounded-md border border-slate-200 px-3 text-sm tabular-nums outline-none focus:border-emerald-400 lg:w-28" type="number" min={1} max={100} value={count} onChange={(e) => setCount(e.target.value)} /></label>
        <label className="w-full text-xs font-medium text-slate-500 lg:w-auto">增加时长（天）<input aria-label="增加时长（天）" className="mt-1 block h-9 w-full rounded-md border border-slate-200 px-3 text-sm tabular-nums outline-none focus:border-emerald-400 lg:w-32" type="number" min={1} max={3650} value={durationDays} onChange={(e) => setDurationDays(e.target.value)} /></label>
        <label className="w-full text-xs font-medium text-slate-500 lg:w-auto">兑换截止日（可选）<input aria-label="兑换截止日" className="mt-1 block h-9 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-emerald-400 lg:w-40" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></label>
        <Button className="w-full lg:w-auto" disabled={generating} onClick={() => void generate()}><ShieldCheck className="h-4 w-4" />{generating ? "生成中…" : "生成卡密"}</Button>
      </div>
      {createdCodes.length > 0 ? <div className="border-t border-amber-200 bg-amber-50/70 p-5" aria-live="polite">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-medium text-amber-900">本批卡密已生成</div><div className="mt-1 text-xs text-amber-700">完整卡密已保存，可随时在下方记录中查看和搜索。</div></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => void copyCreated()}><Copy className="h-4 w-4" />复制全部</Button><Button size="sm" variant="outline" onClick={downloadCreated}><Download className="h-4 w-4" />下载 TXT</Button></div></div>
        <textarea aria-label="刚生成的卡密" readOnly className="mt-3 h-32 w-full resize-y rounded-lg border border-amber-200 bg-white p-3 font-mono text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-emerald-300" value={createdCodes.join("\n")} />
      </div> : null}
    </section>
    <ManagerCard title="卡密记录" subtitle={`共 ${total} 个卡密；已使用卡密保留兑换人与时间`}>
      <DataToolbar actions={<Button size="sm" variant="outline" disabled={loading} onClick={() => void load(page)}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />刷新</Button>}>
        <SearchInput aria-label="搜索卡密" placeholder="搜索完整卡密或批次 ID…" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void load(1); }} />
        <FilterSelect aria-label="卡密状态" value={status} onChange={(e) => { setStatus(e.target.value); void load(1, e.target.value); }}><option value="">全部状态</option><option value="active">可兑换</option><option value="redeemed">已使用</option><option value="expired">已过期</option><option value="revoked">已撤销</option></FilterSelect>
      </DataToolbar>
      <Table><TableHeader><TableRow><TableHead>卡密</TableHead><TableHead>增加时长</TableHead><TableHead>兑换截止</TableHead><TableHead>状态</TableHead><TableHead>使用人</TableHead><TableHead>生成时间</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader><TableBody>
        {items.map((code) => <TableRow key={code.id}><TableCell><div className="font-mono text-xs font-semibold text-slate-700">{code.code || code.codeHint}</div>{!code.code ? <div className="mt-1 text-[10px] text-amber-600">旧卡密仅保留脱敏编号</div> : null}<div className="mt-1 font-mono text-[10px] text-slate-400">批次 {code.batchId.slice(0, 8)}</div></TableCell><TableCell className="font-semibold tabular-nums">{code.durationDays} 天</TableCell><TableCell className="tabular-nums">{code.validUntil ? formatDate(code.validUntil) : "不限"}</TableCell><TableCell><CodeBadge status={code.effectiveStatus} /></TableCell><TableCell>{code.redeemedByUserId ? <div><div className="max-w-36 truncate text-sm">{code.redeemedByNickname || "未设置昵称"}</div><div className="mt-0.5 font-mono text-[10px] text-slate-400">{code.redeemedByUserId.slice(0, 10)}…</div></div> : "—"}</TableCell><TableCell className="text-xs tabular-nums text-slate-500">{formatDateTime(code.createdAt)}</TableCell><TableCell className="text-right">{code.effectiveStatus === "active" ? <Button size="sm" variant="danger" onClick={() => void revoke(code)}><RotateCcw className="h-4 w-4" />撤销</Button> : <span className="text-xs text-slate-400">—</span>}</TableCell></TableRow>)}
        {!loading && items.length === 0 ? <TableRow><TableCell colSpan={7} className="py-12 text-center text-sm text-slate-400">还没有符合条件的卡密。可在上方生成第一批。</TableCell></TableRow> : null}
      </TableBody></Table><TableFooter page={page} pageSize={50} total={total} loading={loading} onPageChange={(next) => void load(next)} />
    </ManagerCard>
  </div>;
}

function ManagerCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-200/40"><div className="border-b border-slate-100 px-5 py-4"><h2 className="text-base font-semibold text-slate-800">{title}</h2><p className="mt-1 text-xs text-slate-400">{subtitle}</p></div>{children}</section>;
}

function BindingBadge({ account }: { account: SportsUser["account"] }) {
  if (!account) return <Badge>未创建</Badge>;
  return account.bindStatus === "bound" ? <Badge variant="success">已绑定</Badge> : <Badge variant="warning">待绑定</Badge>;
}

function CodeBadge({ status }: { status: string }) {
  const map: Record<string, { text: string; variant: "success" | "warning" | "danger" | "secondary" }> = {
    active: { text: "可兑换", variant: "success" }, redeemed: { text: "已使用", variant: "secondary" },
    expired: { text: "已过期", variant: "warning" }, revoked: { text: "已撤销", variant: "danger" }
  };
  const item = map[status] ?? { text: status, variant: "secondary" as const };
  return <Badge variant={item.variant}>{item.text}</Badge>;
}

function formatDate(value: string) { return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)); }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value)); }
function remainingDays(value: string) { return `剩余 ${Math.max(1, Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000))} 天`; }
