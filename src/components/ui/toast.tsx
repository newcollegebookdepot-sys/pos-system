"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

type Toast = { id: number; title: string; body?: string; tone?: "info" | "success" | "warning" | "error" };

const ToastCtx = createContext<{
  push: (t: Omit<Toast, "id">) => void;
} | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setItems((cur) => [...cur, { ...t, id }]);
    setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== id)), 4500);
  }, []);
  const value = useMemo(() => ({ push }), [push]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toast-stack no-print">
        {items.map((t) => (
          <div key={t.id} className={`toast-item ${t.tone || "info"}`}>
            <p className="strong" style={{ margin: 0 }}>
              {t.title}
            </p>
            {t.body ? (
              <p className="muted" style={{ margin: "4px 0 0" }}>
                {t.body}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast outside provider");
  return ctx;
}
