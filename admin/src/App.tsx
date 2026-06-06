import { Check, RefreshCw, Settings, Users, WalletCards, X } from "lucide-react";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./components/ui/table";

type PendingAttribution = {
  id: string;
  itemTitle: string;
  userHint: string;
  confidence: number;
  reason: string;
  commission: string;
};

const rows: PendingAttribution[] = [
  {
    id: "attr-1001",
    itemTitle: "高佣示例商品",
    userHint: "用户 user-1",
    confidence: 0.5,
    reason: "multiple_candidates_inside_window",
    commission: "¥6.17"
  },
  {
    id: "attr-1002",
    itemTitle: "待补充订单商品",
    userHint: "用户提交后四位 1234",
    confidence: 0.25,
    reason: "candidate_outside_window",
    commission: "¥3.20"
  }
];

const users = [
  {
    id: "user-1",
    openid: "mock_openid_demo_001",
    conversions: 12,
    estimatedCommission: "¥36.80",
    status: "活跃"
  },
  {
    id: "user-2",
    openid: "mock_openid_demo_002",
    conversions: 4,
    estimatedCommission: "¥8.50",
    status: "待观察"
  }
];

const configItems = [
  ["推广位 adzone_id", "mock-adzone"],
  ["用户分佣比例", "50%"],
  ["自动归因窗口", "复制后 24 小时"],
  ["高佣复核阈值", "¥50.00"],
  ["订单同步策略", "10-30 分钟增量，90 天回补"]
];

export function App() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="grid min-h-screen grid-cols-[240px_1fr]">
        <aside className="border-r border-slate-200 bg-white px-4 py-6">
          <div className="px-3">
            <div className="text-lg font-semibold">淘宝客后台</div>
            <div className="mt-1 text-xs text-slate-500">转链、用户、订单和配置</div>
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
            <a className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-50" href="#config">
              配置
            </a>
          </nav>
        </aside>

        <section className="px-8 py-8">
          <header className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold">运营控制台</h1>
              <p className="mt-2 text-sm text-slate-500">查看用户、转链规模、待复核订单和核心返佣配置。</p>
            </div>
            <Button variant="outline">
              <RefreshCw className="h-4 w-4" />
              刷新
            </Button>
          </header>

          <section id="overview" className="mt-6 grid grid-cols-4 gap-4">
            <MetricCard icon={<Users className="h-4 w-4" />} label="用户数" value="2" note="小程序注册用户" />
            <MetricCard icon={<WalletCards className="h-4 w-4" />} label="转链数" value="16" note="累计生成推广内容" />
            <MetricCard label="复制事件" value="11" note="用于订单归因" />
            <MetricCard label="待复核" value="2" note="需要人工判断" />
          </section>

          <section id="users" className="mt-6 rounded-lg border border-slate-200 bg-white">
            <SectionTitle title="用户" subtitle="普通用户、转链次数和预估收益。" />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>用户 ID</TableHead>
                  <TableHead>OpenID</TableHead>
                  <TableHead>转链数</TableHead>
                  <TableHead>预估佣金</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.id}</TableCell>
                    <TableCell>{user.openid}</TableCell>
                    <TableCell>{user.conversions}</TableCell>
                    <TableCell>{user.estimatedCommission}</TableCell>
                    <TableCell>
                      <Badge variant={user.status === "活跃" ? "secondary" : "warning"}>{user.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>

          <section id="attribution" className="mt-6 rounded-lg border border-slate-200 bg-white">
            <SectionTitle title="订单归因复核" subtitle="处理自动匹配不确定、用户补充和高佣金订单。" />
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
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.itemTitle}</TableCell>
                    <TableCell>{row.userHint}</TableCell>
                    <TableCell>
                      <Badge variant={row.confidence >= 0.5 ? "warning" : "secondary"}>
                        {(row.confidence * 100).toFixed(0)}%
                      </Badge>
                    </TableCell>
                    <TableCell>{row.reason}</TableCell>
                    <TableCell>{row.commission}</TableCell>
                    <TableCell className="flex justify-end gap-2">
                      <Button size="sm" variant="outline">
                        <X className="h-4 w-4" />
                        驳回
                      </Button>
                      <Button size="sm">
                        <Check className="h-4 w-4" />
                        通过
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>

          <section id="config" className="mt-6 rounded-lg border border-slate-200 bg-white">
            <SectionTitle title="系统配置" subtitle="第一版只展示核心运营配置，后续再加编辑和审计。" />
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
  value: string;
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
