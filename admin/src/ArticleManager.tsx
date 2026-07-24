import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Heading2,
  Image,
  Info,
  Italic,
  List,
  ListOrdered,
  Minus,
  Pencil,
  Pin,
  Plus,
  Power,
  Quote,
  Trash2
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { ClearFiltersButton, DataToolbar, FilterSelect, SearchInput } from "./components/ui/data-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./components/ui/table";
import {
  fetchAdminApi,
  mediaUrl,
  uploadAdminFile,
  type AdminArticle,
  type AdminArticleBlock
} from "./lib/api";
import { toast } from "./lib/toast";

type DraftArticle = {
  id: string | null;
  title: string;
  summary: string;
  coverUrl: string;
  status: "draft" | "published";
  pinned: boolean;
  blocks: AdminArticleBlock[];
};

const newParagraph = (): AdminArticleBlock => ({ type: "paragraph", text: "" });
const emptyDraft = (): DraftArticle => ({
  id: null,
  title: "",
  summary: "",
  coverUrl: "",
  status: "draft",
  pinned: false,
  blocks: [newParagraph()]
});

const blockOptions: Array<{
  type: AdminArticleBlock["type"];
  label: string;
  icon: typeof Heading2;
  create: () => AdminArticleBlock;
}> = [
  { type: "paragraph", label: "正文", icon: AlignLeft, create: newParagraph },
  { type: "heading", label: "标题", icon: Heading2, create: () => ({ type: "heading", text: "", level: 2 }) },
  { type: "image", label: "图片", icon: Image, create: () => ({ type: "image", url: "", caption: "" }) },
  { type: "quote", label: "引用", icon: Quote, create: () => ({ type: "quote", text: "" }) },
  { type: "list", label: "列表", icon: List, create: () => ({ type: "list", style: "unordered", items: [""] }) },
  { type: "callout", label: "提示框", icon: Info, create: () => ({ type: "callout", tone: "info", text: "" }) },
  { type: "divider", label: "分割线", icon: Minus, create: () => ({ type: "divider" }) }
];

export function ArticleManager({ adminToken }: { adminToken: string }) {
  const [articles, setArticles] = useState<AdminArticle[]>([]);
  const [draft, setDraft] = useState<DraftArticle | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [pinFilter, setPinFilter] = useState("");

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return articles.filter((article) => {
      if (statusFilter && article.status !== statusFilter) return false;
      if (pinFilter === "pinned" && !article.pinned) return false;
      if (pinFilter === "normal" && article.pinned) return false;
      return !keyword || [article.title, article.summary ?? ""].some((value) => value.toLowerCase().includes(keyword));
    });
  }, [articles, pinFilter, search, statusFilter]);

  const loadArticles = useCallback(async () => {
    if (!adminToken) return;
    try {
      const result = await fetchAdminApi<{ articles: AdminArticle[] }>("/api/admin/articles", adminToken);
      setArticles(result.articles);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "文章加载失败");
    }
  }, [adminToken]);

  useEffect(() => {
    void loadArticles();
  }, [loadArticles]);

  function edit(article: AdminArticle) {
    setDraft({
      id: article.id,
      title: article.title,
      summary: article.summary ?? "",
      coverUrl: article.coverUrl ?? "",
      status: article.status === "published" ? "published" : "draft",
      pinned: article.pinned,
      blocks: article.blocks.length ? article.blocks : [newParagraph()]
    });
    setError("");
  }

  function updateBlock(index: number, block: AdminArticleBlock) {
    if (!draft) return;
    setDraft({ ...draft, blocks: draft.blocks.map((item, i) => (i === index ? block : item)) });
  }

  function addBlock(block: AdminArticleBlock, after = draft?.blocks.length ?? 0) {
    if (!draft) return;
    const blocks = [...draft.blocks];
    blocks.splice(after, 0, block);
    setDraft({ ...draft, blocks });
  }

  function moveBlock(index: number, delta: number) {
    if (!draft) return;
    const target = index + delta;
    if (target < 0 || target >= draft.blocks.length) return;
    const blocks = [...draft.blocks];
    [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
    setDraft({ ...draft, blocks });
  }

  function removeBlock(index: number) {
    if (!draft) return;
    const blocks = draft.blocks.filter((_, i) => i !== index);
    setDraft({ ...draft, blocks: blocks.length ? blocks : [newParagraph()] });
  }

  async function uploadCover(file: File) {
    try {
      const url = await uploadAdminFile(file, adminToken);
      setDraft((current) => current ? { ...current, coverUrl: url } : current);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "封面上传失败");
    }
  }

  async function uploadBlockImage(index: number, file: File) {
    try {
      const url = await uploadAdminFile(file, adminToken);
      if (!draft) return;
      const block = draft.blocks[index];
      if (block.type === "image") updateBlock(index, { ...block, url });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "图片上传失败");
    }
  }

  async function save() {
    if (!draft) return;
    const invalidBlock = draft.blocks.find((block) => {
      if (block.type === "divider") return false;
      if (block.type === "image") return !block.url;
      if (block.type === "list") return block.items.every((item) => !item.trim());
      return !block.text.trim();
    });
    if (!draft.title.trim()) return setError("请填写文章标题");
    if (invalidBlock) return setError("正文中有未填写完成的内容块");

    setSaving(true);
    setError("");
    const payload = {
      title: draft.title.trim(),
      summary: draft.summary.trim() || null,
      coverUrl: draft.coverUrl || null,
      status: draft.status,
      pinned: draft.pinned,
      blocks: draft.blocks.map(normalizeBlock)
    };
    try {
      if (draft.id) {
        await fetchAdminApi(`/api/admin/articles/${draft.id}`, adminToken, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
      } else {
        await fetchAdminApi("/api/admin/articles", adminToken, {
          method: "POST",
          body: JSON.stringify(payload)
        });
      }
      toast(draft.id ? "文章已更新" : "文章已创建");
      setDraft(null);
      await loadArticles();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function updateArticle(article: AdminArticle, patch: Partial<Pick<AdminArticle, "status" | "pinned">>) {
    await fetchAdminApi(`/api/admin/articles/${article.id}`, adminToken, {
      method: "PUT",
      body: JSON.stringify({
        title: article.title,
        summary: article.summary,
        coverUrl: article.coverUrl,
        status: article.status === "published" ? "published" : "draft",
        pinned: article.pinned,
        blocks: article.blocks,
        ...patch
      })
    });
    await loadArticles();
  }

  async function remove(id: string) {
    if (!window.confirm("确定删除这篇文章吗？")) return;
    await fetchAdminApi(`/api/admin/articles/${id}`, adminToken, { method: "DELETE" });
    toast("文章已删除");
    await loadArticles();
  }

  return (
    <section className="mt-5 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="font-semibold">文章管理</h2>
          <p className="mt-0.5 text-sm text-slate-400">共 {articles.length} 篇，用内容块编写教程与指南</p>
        </div>
        <Button size="sm" onClick={() => setDraft(emptyDraft())}><Plus className="h-4 w-4" />新建文章</Button>
      </div>

      {error ? <div className="mx-4 mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      {draft ? (
        <div className="border-b border-slate-200 bg-slate-50/60 p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-semibold">{draft.id ? "编辑文章" : "新建文章"}</h3>
              <p className="text-xs text-slate-500">左侧编排内容，右侧实时预览</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>关闭</Button>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
            <div className="min-w-0 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium text-slate-700 sm:col-span-2">
                  文章标题
                  <input className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
                </label>
                <label className="text-sm font-medium text-slate-700 sm:col-span-2">
                  摘要
                  <textarea className="mt-1 h-20 w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2" maxLength={300} value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  封面图
                  <span className="mt-1 flex h-10 items-center gap-2">
                    <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm hover:border-emerald-300">
                      <Image className="h-4 w-4" />{draft.coverUrl ? "更换封面" : "上传封面"}
                      <input className="hidden" type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadCover(file); event.target.value = ""; }} />
                    </label>
                    {draft.coverUrl ? <button className="text-xs text-rose-600" onClick={() => setDraft({ ...draft, coverUrl: "" })}>移除</button> : null}
                  </span>
                </label>
                <div className="flex items-end gap-4 pb-2">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.pinned} onChange={(event) => setDraft({ ...draft, pinned: event.target.checked })} />置顶</label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.status === "published"} onChange={(event) => setDraft({ ...draft, status: event.target.checked ? "published" : "draft" })} />立即发布</label>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 border-y border-slate-200 py-3">
                {blockOptions.map((option) => (
                  <Button key={option.type} size="sm" variant="outline" title={`添加${option.label}`} onClick={() => addBlock(option.create())}>
                    <option.icon className="h-4 w-4" />{option.label}
                  </Button>
                ))}
              </div>

              <div className="space-y-3">
                {draft.blocks.map((block, index) => (
                  <BlockEditor
                    key={index}
                    block={block}
                    index={index}
                    total={draft.blocks.length}
                    onChange={(value) => updateBlock(index, value)}
                    onMove={(delta) => moveBlock(index, delta)}
                    onRemove={() => removeBlock(index)}
                    onUpload={(file) => void uploadBlockImage(index, file)}
                  />
                ))}
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
                <Button size="sm" variant="outline" onClick={() => setDraft(null)}>取消</Button>
                <Button size="sm" disabled={saving} onClick={() => void save()}><Check className="h-4 w-4" />{saving ? "保存中..." : "保存文章"}</Button>
              </div>
            </div>

            <ArticlePreview draft={draft} />
          </div>
        </div>
      ) : null}

      <DataToolbar>
        <SearchInput placeholder="搜索文章标题或摘要" value={search} onChange={(event) => setSearch(event.target.value)} />
        <FilterSelect aria-label="发布状态" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="">全部发布状态</option><option value="published">已发布</option><option value="draft">草稿</option>
        </FilterSelect>
        <FilterSelect aria-label="置顶状态" value={pinFilter} onChange={(event) => setPinFilter(event.target.value)}>
          <option value="">全部位置</option><option value="pinned">已置顶</option><option value="normal">未置顶</option>
        </FilterSelect>
        <ClearFiltersButton visible={Boolean(search || statusFilter || pinFilter)} onClick={() => { setSearch(""); setStatusFilter(""); setPinFilter(""); }} />
      </DataToolbar>
      <Table className="min-w-[880px]">
        <TableHeader><TableRow><TableHead>标题</TableHead><TableHead>内容块</TableHead><TableHead className="text-right">点击量</TableHead><TableHead className="text-right">访问人数</TableHead><TableHead>状态</TableHead><TableHead>发布时间</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader>
        <TableBody>
          {filtered.map((article) => (
            <TableRow key={article.id}>
              <TableCell className="font-medium"><span className="flex items-center gap-2">{article.pinned ? <Badge variant="danger">置顶</Badge> : null}{article.title}</span></TableCell>
              <TableCell>{article.blocks.length}</TableCell>
              <TableCell className="text-right tabular-nums">{article.viewCount}</TableCell>
              <TableCell className="text-right tabular-nums text-emerald-600">{article.visitorCount}</TableCell>
              <TableCell><Badge variant={article.status === "published" ? "secondary" : "warning"}>{article.status === "published" ? "已发布" : "草稿"}</Badge></TableCell>
              <TableCell className="text-slate-500">{article.publishedAt ? new Date(article.publishedAt).toLocaleString("zh-CN") : "未发布"}</TableCell>
              <TableCell><div className="flex justify-end gap-1">
                <Button size="sm" variant="ghost" title="编辑文章" onClick={() => edit(article)}><Pencil className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" title={article.pinned ? "取消置顶" : "置顶"} onClick={() => void updateArticle(article, { pinned: !article.pinned })}><Pin className={`h-4 w-4 ${article.pinned ? "fill-current text-rose-500" : ""}`} /></Button>
                <Button size="sm" variant="ghost" title={article.status === "published" ? "下线" : "发布"} onClick={() => void updateArticle(article, { status: article.status === "published" ? "draft" : "published" })}>{article.status === "published" ? <Power className="h-4 w-4" /> : <CircleDot className="h-4 w-4" />}</Button>
                <Button size="sm" variant="ghost" title="删除文章" onClick={() => void remove(article.id)}><Trash2 className="h-4 w-4 text-rose-500" /></Button>
              </div></TableCell>
            </TableRow>
          ))}
          {!filtered.length ? <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-slate-500">{articles.length ? "没有符合条件的文章" : "暂无文章，点击右上角新建"}</TableCell></TableRow> : null}
        </TableBody>
      </Table>
    </section>
  );
}

function BlockEditor({ block, index, total, onChange, onMove, onRemove, onUpload }: {
  block: AdminArticleBlock;
  index: number;
  total: number;
  onChange: (block: AdminArticleBlock) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
  onUpload: (file: File) => void;
}) {
  const option = blockOptions.find((item) => item.type === block.type)!;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs font-semibold text-slate-500"><option.icon className="h-4 w-4" />{index + 1}. {option.label}</span>
        <div className="flex">
          <Button size="sm" variant="ghost" className="px-2" disabled={index === 0} title="上移" onClick={() => onMove(-1)}><ChevronUp className="h-4 w-4" /></Button>
          <Button size="sm" variant="ghost" className="px-2" disabled={index === total - 1} title="下移" onClick={() => onMove(1)}><ChevronDown className="h-4 w-4" /></Button>
          <Button size="sm" variant="ghost" className="px-2" title="删除内容块" onClick={onRemove}><Trash2 className="h-4 w-4 text-rose-500" /></Button>
        </div>
      </div>
      {block.type === "paragraph" ? <>
        <TextToolbar block={block} onChange={onChange} />
        <textarea className="mt-2 min-h-28 w-full resize-y rounded-md border border-slate-200 px-3 py-2 text-sm" placeholder="输入正文内容" value={block.text} onChange={(event) => onChange({ ...block, text: event.target.value })} />
      </> : null}
      {block.type === "heading" ? <>
        <div className="flex flex-wrap gap-1.5">
          <select className="h-8 rounded-md border border-slate-200 px-2 text-xs" value={block.level} onChange={(event) => onChange({ ...block, level: Number(event.target.value) as 2 | 3 })}><option value={2}>二级标题</option><option value={3}>三级标题</option></select>
          <AlignButtons align={block.align} onAlign={(align) => onChange({ ...block, align })} />
        </div>
        <input className="mt-2 h-10 w-full rounded-md border border-slate-200 px-3 text-sm" placeholder="输入标题" value={block.text} onChange={(event) => onChange({ ...block, text: event.target.value })} />
      </> : null}
      {block.type === "image" ? <div className="space-y-2">
        {block.url ? <img className="max-h-64 w-full rounded-md bg-slate-100 object-contain" src={mediaUrl(block.url)} alt="" /> : null}
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-slate-200 px-3 text-sm hover:border-emerald-300"><Image className="h-4 w-4" />{block.url ? "更换图片" : "上传图片"}<input className="hidden" type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); event.target.value = ""; }} /></label>
        <input className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm" placeholder="图片说明（可选）" value={block.caption ?? ""} onChange={(event) => onChange({ ...block, caption: event.target.value })} />
      </div> : null}
      {block.type === "quote" ? <textarea className="min-h-24 w-full resize-y rounded-md border border-slate-200 px-3 py-2 text-sm" placeholder="输入引用内容" value={block.text} onChange={(event) => onChange({ ...block, text: event.target.value })} /> : null}
      {block.type === "list" ? <div>
        <div className="mb-2 flex gap-1.5">
          <Button size="sm" variant={block.style === "unordered" ? "default" : "outline"} onClick={() => onChange({ ...block, style: "unordered" })}><List className="h-4 w-4" />无序</Button>
          <Button size="sm" variant={block.style === "ordered" ? "default" : "outline"} onClick={() => onChange({ ...block, style: "ordered" })}><ListOrdered className="h-4 w-4" />有序</Button>
        </div>
        <textarea className="min-h-28 w-full resize-y rounded-md border border-slate-200 px-3 py-2 text-sm" placeholder={"每行一个列表项\n例如：打开商品页\n领取优惠券"} value={block.items.join("\n")} onChange={(event) => onChange({ ...block, items: event.target.value.split("\n") })} />
      </div> : null}
      {block.type === "callout" ? <div>
        <select className="mb-2 h-8 rounded-md border border-slate-200 px-2 text-xs" value={block.tone} onChange={(event) => onChange({ ...block, tone: event.target.value as "info" | "success" | "warning" })}><option value="info">说明</option><option value="success">技巧</option><option value="warning">注意</option></select>
        <textarea className="min-h-24 w-full resize-y rounded-md border border-slate-200 px-3 py-2 text-sm" placeholder="输入提示内容" value={block.text} onChange={(event) => onChange({ ...block, text: event.target.value })} />
      </div> : null}
      {block.type === "divider" ? <div className="py-4"><hr className="border-slate-300" /></div> : null}
    </div>
  );
}

function TextToolbar({ block, onChange }: {
  block: Extract<AdminArticleBlock, { type: "paragraph" }>;
  onChange: (block: AdminArticleBlock) => void;
}) {
  return <div className="flex flex-wrap gap-1.5">
    <Button size="sm" variant={block.bold ? "default" : "outline"} className="px-2" title="加粗" onClick={() => onChange({ ...block, bold: !block.bold })}><Bold className="h-4 w-4" /></Button>
    <Button size="sm" variant={block.italic ? "default" : "outline"} className="px-2" title="斜体" onClick={() => onChange({ ...block, italic: !block.italic })}><Italic className="h-4 w-4" /></Button>
    <AlignButtons align={block.align} onAlign={(align) => onChange({ ...block, align })} />
  </div>;
}

function AlignButtons({ align = "left", onAlign }: { align?: "left" | "center" | "right"; onAlign: (align: "left" | "center" | "right") => void }) {
  return <>{[
    ["left", AlignLeft, "左对齐"],
    ["center", AlignCenter, "居中"],
    ["right", AlignRight, "右对齐"]
  ].map(([value, Icon, label]) => <Button key={value as string} size="sm" variant={align === value ? "default" : "outline"} className="px-2" title={label as string} onClick={() => onAlign(value as "left" | "center" | "right")}><Icon className="h-4 w-4" /></Button>)}</>;
}

function ArticlePreview({ draft }: { draft: DraftArticle }) {
  return <aside className="self-start xl:sticky xl:top-4">
    <div className="mb-2 text-xs font-semibold uppercase text-slate-400">小程序预览</div>
    <article className="mx-auto max-h-[760px] max-w-[430px] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      {draft.coverUrl ? <img className="aspect-[16/9] w-full object-cover" src={mediaUrl(draft.coverUrl)} alt="" /> : null}
      <div className="px-5 py-6">
        <h1 className="text-2xl font-bold leading-tight text-slate-900">{draft.title || "文章标题"}</h1>
        {draft.summary ? <p className="mt-2 text-sm leading-6 text-slate-500">{draft.summary}</p> : null}
        <div className="mt-6 space-y-4">{draft.blocks.map((block, index) => <PreviewBlock key={index} block={block} />)}</div>
      </div>
    </article>
  </aside>;
}

function PreviewBlock({ block }: { block: AdminArticleBlock }) {
  if (block.type === "paragraph") return <p className={`${block.bold ? "font-bold" : ""} ${block.italic ? "italic" : ""} whitespace-pre-wrap text-[15px] leading-7 text-slate-700`} style={{ textAlign: block.align ?? "left" }}>{block.text || "正文内容"}</p>;
  if (block.type === "heading") return block.level === 2 ? <h2 className="pt-2 text-xl font-bold text-slate-900" style={{ textAlign: block.align ?? "left" }}>{block.text || "二级标题"}</h2> : <h3 className="pt-1 text-lg font-semibold text-slate-900" style={{ textAlign: block.align ?? "left" }}>{block.text || "三级标题"}</h3>;
  if (block.type === "image") return <figure>{block.url ? <img className="w-full rounded-md" src={mediaUrl(block.url)} alt="" /> : <div className="flex aspect-video items-center justify-center rounded-md bg-slate-100 text-sm text-slate-400">等待上传图片</div>}{block.caption ? <figcaption className="mt-1 text-center text-xs text-slate-400">{block.caption}</figcaption> : null}</figure>;
  if (block.type === "quote") return <blockquote className="border-l-4 border-emerald-400 bg-emerald-50 px-4 py-3 text-sm leading-6 text-slate-700">{block.text || "引用内容"}</blockquote>;
  if (block.type === "list") { const Tag = block.style === "ordered" ? "ol" : "ul"; return <Tag className={`${block.style === "ordered" ? "list-decimal" : "list-disc"} space-y-1.5 pl-6 text-[15px] leading-6 text-slate-700`}>{block.items.filter(Boolean).map((item, index) => <li key={index}>{item}</li>)}</Tag>; }
  if (block.type === "callout") return <div className={`rounded-md border px-4 py-3 text-sm leading-6 ${block.tone === "warning" ? "border-amber-200 bg-amber-50 text-amber-900" : block.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-sky-200 bg-sky-50 text-sky-900"}`}>{block.text || "提示内容"}</div>;
  return <hr className="border-slate-200" />;
}

function normalizeBlock(block: AdminArticleBlock): AdminArticleBlock {
  if (block.type === "divider") return block;
  if (block.type === "image") return { ...block, caption: block.caption?.trim() || null };
  if (block.type === "list") return { ...block, items: block.items.map((item) => item.trim()).filter(Boolean) };
  return { ...block, text: block.text.trim() };
}
