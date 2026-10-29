"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/types";

export function ActionForm({
  action,
  children,
  className = "",
  resetOnSuccess = false,
  successMessage,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  successMessage?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form
      action={formAction}
      className="grid gap-3"
      ref={(form) => {
        if (form && resetOnSuccess && state.ok && !pending) {
          if (form.dataset.saved !== "1") {
            form.dataset.saved = "1";
            form.reset();
          }
        }
        if (form && pending) form.dataset.saved = "0";
      }}
    >
      <fieldset disabled={pending} className={`m-0 grid min-w-0 gap-3 border-0 p-0 ${className}`}>
        {children}
      </fieldset>
      <div aria-live="polite">
        {pending ? <p className="text-sm text-ink/60">Saving...</p> : null}
        {!pending && state.error ? (
          <p role="alert" className="text-sm text-stamp">
            {state.error}
          </p>
        ) : null}
        {!pending && state.ok && (state.message || successMessage) ? (
          <p className="text-sm text-forest">{state.message || successMessage}</p>
        ) : null}
      </div>
    </form>
  );
}
