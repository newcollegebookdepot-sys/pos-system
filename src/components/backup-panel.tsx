"use client";

import { useState, useTransition } from "react";
import { exportBackupJson, restoreBackupJson } from "@/server/backup";

export function BackupPanel() {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="card space-y-3 p-5">
      <h2 className="font-serif text-2xl">Backup</h2>
      <p className="muted text-sm">Download a JSON copy. Prefer Turso dashboard backups for the live cloud shop.</p>
      <button
        type="button"
        className="btn btn-primary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await exportBackupJson();
            if ("error" in res) {
              setMsg(res.error);
              return;
            }
            const blob = new Blob([res.json], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `pos-backup-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
            setMsg("Backup downloaded");
          })
        }
      >
        Download backup
      </button>
      <label className="block text-sm">
        Restore from JSON
        <input
          type="file"
          accept="application/json,.json"
          className="mt-1 block w-full text-sm"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            start(async () => {
              const text = await file.text();
              const res = await restoreBackupJson(text);
              setMsg(res.error || res.message || "Done");
            });
          }}
        />
      </label>
      {msg ? <p className="text-sm text-forest">{msg}</p> : null}
    </div>
  );
}
