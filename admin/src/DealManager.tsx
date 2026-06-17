import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./components/ui/table";
import { fetchAdminApi, mediaUrl, uploadAdminFile, type AdminDeal, type AdminDealStep } from "./lib/api";
import { toast } from "./lib/toast";

const emptyStep: AdminDealStep = { content: "", copyType: null, copyValue: "", images: [], videoUrl: "" };

type DealSaveResult = AdminDeal & { notify?: { sent: number; targets: number } };

// 发布后的订阅推送结果文案
function pushSuffix(notify?: { sent: number; targets: number }): string {
  if (!notify) return "";
  if (notify.targets === 0) return "（暂无订阅用户，未推送）";
  if (notify.sent === 0) return `（${notify.targets} 人订阅，但发送失败，请查 IP 白名单/日志）`;
  return `，已推送 ${notify.sent} 人`;
}

type DraftDeal = {
  id: string | null;
  title: string;
  summary: string;
  status: "draft" | "published";
  pinned: boolean;
  steps: AdminDealStep[];
};

const emptyDraft: DraftDeal = {
  id: null,
  title: "",
  summary: "",
  status: "published",
  pinned: false,
  steps: [{ ...emptyStep }]
};

export function DealManager({ adminToken }: { adminToken: string }) {
  const [deals, setDeals] = useState<AdminDeal[]>([]);
  const [draft, setDraft] = useState<DraftDeal | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const loadDeals = useCallback(async () => {
    if (!adminToken) return;
    try {
      const response = await fetchAdminApi<{ deals: AdminDeal[] }>("/api/admin/deals", adminToken);
      setDeals(response.deals);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "线报加载失败");
    }
  }, [adminToken]);

  useEffect(() => {
    void loadDeals();
  }, [loadDeals]);

  function startCreate() {
    setDraft({ ...emptyDraft, steps: [{ ...emptyStep }] });
  }

  function startEdit(deal: AdminDeal) {
    setDraft({
      id: deal.id,
      title: deal.title,
      summary: deal.summary ?? "",
      status: deal.status === "published" ? "published" : "draft",
      pinned: deal.pinned,
      steps:
        deal.steps.length > 0
          ? deal.steps.map((step) => ({ ...emptyStep, ...step, images: step.images ?? [] }))
          : [{ ...emptyStep }]
    });
  }

  async function aiParse() {
    const raw = aiText.trim();
    if (!raw) {
      toast("请先粘贴要识别的文案", "error");
      return;
    }
    setAiLoading(true);
    try {
      const { deal } = await fetchAdminApi<{
        deal: { title: string; summary: string; steps: Array<{ content: string; copyType: "link" | "password" | null; copyValue: string }> };
      }>("/api/admin/deals/ai-parse", adminToken, {
        method: "POST",
        body: JSON.stringify({ rawContent: raw })
      });
      setDraft((prev) => ({
        id: prev?.id ?? null,
        title: deal.title,
        summary: deal.summary,
        status: prev?.status ?? "published",
        pinned: prev?.pinned ?? false,
        steps: deal.steps.map((s) => ({ ...emptyStep, content: s.content, copyType: s.copyType, copyValue: s.copyValue }))
      }));
      setAiText("");
      toast("已识别，请检查并补充图片后发布");
    } catch (aiError) {
      toast(aiError instanceof Error ? aiError.message : "识别失败，请重试", "error");
    } finally {
      setAiLoading(false);
    }
  }

  function updateStep(index: number, patch: Partial<AdminDealStep>) {
    if (!draft) return;
    setDraft({
      ...draft,
      steps: draft.steps.map((step, i) => (i === index ? { ...step, ...patch } : step))
    });
  }

  function moveStep(index: number, delta: number) {
    if (!draft) return;
    const target = index + delta;
    if (target < 0 || target >= draft.steps.length) return;
    const steps = [...draft.steps];
    [steps[index], steps[target]] = [steps[target], steps[index]];
    setDraft({ ...draft, steps });
  }

  async function saveDraft() {
    if (!draft) return;
    if (!draft.title.trim()) {
      setError("请填写线报标题");
      return;
    }
    if (draft.steps.some((step) => !step.content.trim())) {
      setError("每个步骤都需要填写说明");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const payload = {
        title: draft.title.trim(),
        summary: draft.summary.trim() || null,
        status: draft.status,
        pinned: draft.pinned,
        steps: draft.steps.map((step) => ({
          content: step.content.trim(),
          copyType: step.copyValue?.trim() ? step.copyType || "link" : null,
          copyValue: step.copyValue?.trim() || null,
          images: step.images ?? [],
          videoUrl: step.videoUrl || null
        }))
      };
      const result = draft.id
        ? await fetchAdminApi<DealSaveResult>(`/api/admin/deals/${draft.id}`, adminToken, {
            method: "PUT",
            body: JSON.stringify(payload)
          })
        : await fetchAdminApi<DealSaveResult>("/api/admin/deals", adminToken, {
            method: "POST",
            body: JSON.stringify(payload)
          });
      setDraft(null);
      toast(`${draft.id ? "线报已更新" : "线报已创建"}${pushSuffix(result.notify)}`);
      await loadDeals();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function togglePublish(deal: AdminDeal) {
    const willPublish = deal.status !== "published";
    const result = await fetchAdminApi<DealSaveResult>(`/api/admin/deals/${deal.id}`, adminToken, {
      method: "PUT",
      body: JSON.stringify({
        title: deal.title,
        summary: deal.summary,
        status: willPublish ? "published" : "draft",
        pinned: deal.pinned,
        steps: deal.steps
      })
    });
    toast(willPublish ? `已发布${pushSuffix(result.notify)}` : "已下线");
    await loadDeals();
  }

  async function togglePin(deal: AdminDeal) {
    await fetchAdminApi(`/api/admin/deals/${deal.id}`, adminToken, {
      method: "PUT",
      body: JSON.stringify({
        title: deal.title,
        summary: deal.summary,
        status: deal.status,
        pinned: !deal.pinned,
        steps: deal.steps
      })
    });
    toast(deal.pinned ? "已取消置顶" : "已置顶");
    await loadDeals();
  }

  async function uploadStepMedia(index: number, file: File, kind: "image" | "video") {
    setError("");
    try {
      const url = await uploadAdminFile(file, adminToken);
      if (!draft) return;
      if (kind === "image") {
        updateStep(index, { images: [...(draft.steps[index].images ?? []), url] });
      } else {
        updateStep(index, { videoUrl: url });
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "上传失败");
    }
  }

  async function removeDeal(id: string) {
    if (!window.confirm("确定删除这条线报吗？")) return;
    await fetchAdminApi(`/api/admin/deals/${id}`, adminToken, { method: "DELETE" });
    toast("线报已删除");
    await loadDeals();
  }

  return (
    <section id="deals" className="mt-5 scroll-mt-6 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="font-semibold">线报管理</h2>
          <p className="mt-0.5 text-sm text-slate-400">发布带步骤指引的线报，用户端按步骤展示并支持一键复制</p>
        </div>
        <Button size="sm" onClick={startCreate}>
          <Plus className="h-4 w-4" />
          新建线报
        </Button>
      </div>

      {error ? <div className="mx-4 mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      {draft ? (
        <div className="m-5 rounded-xl border border-emerald-200/60 bg-emerald-50/30 p-4">
          <div className="mb-4 rounded-lg border border-violet-200 bg-violet-50/50 p-3">
            <div className="mb-2 text-xs font-medium text-violet-700">✨ AI 识别（粘贴促销文案，自动生成线报）</div>
            <textarea
              className="h-20 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-400"
              placeholder="粘贴一段促销文案，例如：优衣库补了 ‼ 速干短袖… https://upurl.cn/xxxx"
              value={aiText}
              onChange={(event) => setAiText(event.target.value)}
            />
            <div className="mt-2 flex items-center gap-2">
              <Button size="sm" disabled={aiLoading} onClick={() => void aiParse()}>
                {aiLoading ? "识别中…" : "AI 识别并填充"}
              </Button>
              <span className="text-xs text-slate-400">识别后会覆盖下方标题/摘要/步骤，图片仍需手动上传</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              标题
              <input
                className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              />
            </label>
            <label className="text-sm">
              摘要（列表页展示，可空）
              <input
                className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
                value={draft.summary}
                onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
              />
            </label>
          </div>

          <div className="mt-4 space-y-3">
            {draft.steps.map((step, index) => (
              <div key={index} className="rounded-md border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">步骤 {index + 1}</span>
                  <span className="flex gap-1">
                    <Button size="sm" variant="outline" disabled={index === 0} onClick={() => moveStep(index, -1)}>↑</Button>
                    <Button size="sm" variant="outline" disabled={index === draft.steps.length - 1} onClick={() => moveStep(index, 1)}>↓</Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={draft.steps.length === 1}
                      onClick={() => setDraft({ ...draft, steps: draft.steps.filter((_, i) => i !== index) })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </span>
                </div>
                <textarea
                  className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                  placeholder="这一步用户要做什么"
                  rows={2}
                  value={step.content}
                  onChange={(event) => updateStep(index, { content: event.target.value })}
                />
                <div className="mt-2 flex gap-2">
                  <select
                    className="h-9 rounded-md border border-slate-200 px-2 text-sm"
                    value={step.copyType ?? "link"}
                    onChange={(event) => updateStep(index, { copyType: event.target.value as "link" | "password" })}
                  >
                    <option value="link">链接</option>
                    <option value="password">淘口令</option>
                  </select>
                  <input
                    className="h-9 flex-1 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
                    placeholder="可复制内容（链接或口令，留空则该步骤无复制按钮）"
                    value={step.copyValue ?? ""}
                    onChange={(event) => updateStep(index, { copyValue: event.target.value })}
                  />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {(step.images ?? []).map((img, imgIndex) => (
                    <span key={img} className="relative inline-block">
                      <img alt="" className="h-16 w-16 rounded-md border border-slate-200 object-cover" src={mediaUrl(img)} />
                      <button
                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-700 text-xs text-white"
                        type="button"
                        onClick={() =>
                          updateStep(index, { images: (step.images ?? []).filter((_, i) => i !== imgIndex) })
                        }
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-md border border-dashed border-slate-300 text-xs text-slate-500 hover:border-slate-400">
                    +图片
                    <input
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      type="file"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (file) void uploadStepMedia(index, file, "image");
                      }}
                    />
                  </label>
                  {step.videoUrl ? (
                    <span className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
                      <video className="h-16 w-28 rounded object-cover" src={mediaUrl(step.videoUrl)} />
                      <button className="text-slate-500 underline" type="button" onClick={() => updateStep(index, { videoUrl: "" })}>
                        移除视频
                      </button>
                    </span>
                  ) : (
                    <label className="flex h-16 cursor-pointer items-center justify-center rounded-md border border-dashed border-slate-300 px-3 text-xs text-slate-500 hover:border-slate-400">
                      +视频(mp4)
                      <input
                        accept="video/mp4"
                        className="hidden"
                        type="file"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = "";
                          if (file) void uploadStepMedia(index, file, "video");
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <Button size="sm" variant="outline" onClick={() => setDraft({ ...draft, steps: [...draft.steps, { ...emptyStep }] })}>
              <Plus className="h-4 w-4" />
              添加步骤
            </Button>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  checked={draft.pinned}
                  type="checkbox"
                  onChange={(event) => setDraft({ ...draft, pinned: event.target.checked })}
                />
                置顶
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  checked={draft.status === "published"}
                  type="checkbox"
                  onChange={(event) => setDraft({ ...draft, status: event.target.checked ? "published" : "draft" })}
                />
                立即发布
              </label>
              <Button size="sm" variant="outline" onClick={() => setDraft(null)}>取消</Button>
              <Button size="sm" disabled={saving} onClick={() => void saveDraft()}>
                <Check className="h-4 w-4" />
                {saving ? "保存中…" : "保存"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>标题</TableHead>
            <TableHead>步骤数</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>发布时间</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {deals.map((deal) => (
            <TableRow key={deal.id}>
              <TableCell className="font-medium">
                <span className="flex items-center gap-2">
                  {deal.pinned ? <Badge variant="danger">置顶</Badge> : null}
                  {deal.title}
                </span>
              </TableCell>
              <TableCell>{deal.steps.length}</TableCell>
              <TableCell>
                <Badge variant={deal.status === "published" ? "secondary" : "warning"}>
                  {deal.status === "published" ? "已发布" : "草稿"}
                </Badge>
              </TableCell>
              <TableCell className="text-slate-500">
                {deal.publishedAt ? new Date(deal.publishedAt).toLocaleString("zh-CN") : "未发布"}
              </TableCell>
              <TableCell className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => startEdit(deal)}>
                  <Pencil className="h-4 w-4" />
                  编辑
                </Button>
                <Button size="sm" variant="outline" onClick={() => void togglePin(deal)}>
                  {deal.pinned ? "取消置顶" : "置顶"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => void togglePublish(deal)}>
                  {deal.status === "published" ? "下线" : "发布"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => void removeDeal(deal.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {deals.length === 0 ? (
            <TableRow>
              <TableCell className="py-8 text-center text-sm text-slate-500" colSpan={5}>
                暂无线报，点击右上角「新建线报」开始
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </section>
  );
}
