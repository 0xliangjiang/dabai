import { useEffect, useState } from "react";
import { subscribeToasts, type ToastItem } from "../../lib/toast";
import { cn } from "../../lib/utils";

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => subscribeToasts(setItems), []);

  return (
    <div className="pointer-events-none fixed right-5 top-5 z-50 flex w-72 flex-col gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          className={cn(
            "animate-toast-in rounded-lg border px-4 py-3 text-sm font-medium shadow-lg backdrop-blur",
            item.type === "success" && "border-emerald-200 bg-emerald-50/95 text-emerald-800",
            item.type === "error" && "border-rose-200 bg-rose-50/95 text-rose-800"
          )}
        >
          {item.message}
        </div>
      ))}
    </div>
  );
}
