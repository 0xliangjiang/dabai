export type ToastItem = {
  id: number;
  message: string;
  type: "success" | "error";
};

type Listener = (toasts: ToastItem[]) => void;

let toasts: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener(toasts);
}

export function toast(message: string, type: ToastItem["type"] = "success") {
  const item: ToastItem = { id: nextId++, message, type };
  toasts = [...toasts, item];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((existing) => existing.id !== item.id);
    emit();
  }, 2600);
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  listener(toasts);
  return () => {
    listeners.delete(listener);
  };
}
