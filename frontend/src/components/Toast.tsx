import { create } from "zustand";

interface Toast {
  id: number;
  message: string;
  kind: "info" | "success" | "error";
}

interface ToastStore {
  toasts: Toast[];
  push: (message: string, kind?: Toast["kind"]) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToast = create<ToastStore>((set) => ({
  toasts: [],
  push: (message, kind = "info") => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, message, kind }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 4000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function ToastViewport() {
  const { toasts, dismiss } = useToast();
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          onClick={() => dismiss(t.id)}
          className={`cursor-pointer rounded-lg px-4 py-2 text-sm text-white shadow-lg ${
            t.kind === "error"
              ? "bg-red-600"
              : t.kind === "success"
                ? "bg-emerald-600"
                : "bg-slate-800"
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
