import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: "secondary" | "warning";
};

export function Badge({ className, variant = "secondary", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-1 text-xs font-medium",
        variant === "secondary" && "bg-slate-100 text-slate-700",
        variant === "warning" && "bg-amber-50 text-amber-700",
        className
      )}
      {...props}
    />
  );
}
