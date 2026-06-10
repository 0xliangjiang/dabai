import * as React from "react";
import { cn } from "../../lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost" | "danger";
  size?: "default" | "sm";
};

export function Button({ className, variant = "default", size = "default", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-all duration-150",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500",
        "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
        variant === "default" &&
          "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-sm shadow-emerald-600/20 hover:from-emerald-600 hover:to-emerald-700",
        variant === "outline" && "border border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:text-emerald-700",
        variant === "ghost" && "text-slate-500 hover:bg-slate-100 hover:text-slate-700",
        variant === "danger" && "text-rose-600 hover:bg-rose-50",
        size === "default" && "h-10 px-4",
        size === "sm" && "h-8 px-3",
        className
      )}
      {...props}
    />
  );
}
