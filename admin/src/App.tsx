import { Check, RefreshCw, X } from "lucide-react";
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

export function App() {
  return (
    <main className="min-h-screen bg-slate-50 px-8 py-8 text-slate-950">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">订单归因复核</h1>
            <p className="mt-2 text-sm text-slate-500">处理自动匹配不确定、用户补充和高佣金订单。</p>
          </div>
          <Button variant="outline">
            <RefreshCw className="h-4 w-4" />
            刷新
          </Button>
        </header>

        <section className="rounded-lg border border-slate-200 bg-white">
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
      </div>
    </main>
  );
}
