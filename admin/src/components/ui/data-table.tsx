import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { Button } from "./button";
import { cn } from "../../lib/utils";

export function DataToolbar({
  children,
  actions,
  className
}: {
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-3 lg:flex-row lg:items-center lg:justify-between",
        className
      )}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function SearchInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cn("relative min-w-56 flex-1 sm:max-w-80", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        className="h-9 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
        {...props}
      />
    </div>
  );
}

export function FilterSelect({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none transition-colors focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function ClearFiltersButton({
  visible,
  disabled,
  onClick
}: {
  visible: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  if (!visible) return null;
  return (
    <Button size="sm" variant="ghost" disabled={disabled} onClick={onClick}>
      <X className="h-4 w-4" />
      重置
    </Button>
  );
}

export function TablePagination({
  page,
  pageSize,
  total,
  loading,
  onPageChange,
  compact = false
}: {
  page: number;
  pageSize: number;
  total: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
  compact?: boolean;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      {!compact ? <span className="mr-1 text-xs tabular-nums text-slate-400">{start}-{end} / {total}</span> : null}
      <Button
        size="sm"
        variant="ghost"
        disabled={page <= 1 || loading}
        onClick={() => onPageChange(page - 1)}
        title="上一页"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-14 text-center text-xs tabular-nums text-slate-500">
        {page} / {totalPages}
      </span>
      <Button
        size="sm"
        variant="ghost"
        disabled={page >= totalPages || loading}
        onClick={() => onPageChange(page + 1)}
        title="下一页"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function TableFooter({
  page,
  pageSize,
  total,
  loading,
  onPageChange
}: {
  page: number;
  pageSize: number;
  total: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-between border-t border-slate-200 bg-white px-4 py-3">
      <span className="text-xs text-slate-400">每页 {pageSize} 条</span>
      <TablePagination
        page={page}
        pageSize={pageSize}
        total={total}
        loading={loading}
        onPageChange={onPageChange}
      />
    </div>
  );
}
