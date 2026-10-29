import { ActionForm } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { PageHeader } from "@/components/page-header";
import { requireManager } from "@/lib/auth";
import { listUsers } from "@/lib/repo/users";
import { changeRole, createStaff, resetPassword, setStaffActive } from "@/server/staff";

export const metadata = { title: "Staff" };

export default async function StaffPage() {
  const manager = await requireManager();
  const users = await listUsers();

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Staff"
        description="Cashiers can sell. Managers can also change products, stock, staff, and reports."
      />

      <section className="card max-w-xl p-5">
        <h2 className="font-serif text-2xl">Add a login</h2>
        <div className="mt-4">
          <ActionForm action={createStaff} resetOnSuccess successMessage="Login added">
            <div>
              <label className="label" htmlFor="staff-name">
                Name
              </label>
              <input id="staff-name" name="name" className="field" required maxLength={80} autoComplete="off" />
            </div>
            <div>
              <label className="label" htmlFor="staff-username">
                Username
              </label>
              <input
                id="staff-username"
                name="username"
                className="field"
                required
                minLength={3}
                maxLength={32}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div>
              <label className="label" htmlFor="staff-password">
                Password
              </label>
              <input
                id="staff-password"
                name="password"
                type="password"
                className="field"
                required
                minLength={4}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="label" htmlFor="staff-confirm">
                Confirm password
              </label>
              <input
                id="staff-confirm"
                name="confirmPassword"
                type="password"
                className="field"
                required
                minLength={4}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="label" htmlFor="staff-role">
                Role
              </label>
              <select id="staff-role" name="role" className="field" defaultValue="cashier">
                <option value="cashier">Cashier</option>
                <option value="manager">Manager</option>
              </select>
            </div>
            <button className="btn btn-primary" type="submit">
              Add login
            </button>
          </ActionForm>
        </div>
      </section>

      <ul className="space-y-3">
        {users.map((user) => (
          <li key={`${user.id}-${user.role}-${user.active}`} className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">
                  {user.name}
                  {user.id === manager.id ? <span className="ml-2 text-sm font-medium text-ink/50">You</span> : null}
                </h3>
                <p className="text-sm text-ink/60">
                  {user.username} · <span className="capitalize">{user.role}</span> · {user.active ? "Active" : "Inactive"}
                </p>
              </div>
              {user.id !== manager.id ? (
                <ConfirmButton
                  label={user.active ? "Deactivate" : "Activate"}
                  tone={user.active ? "danger" : "default"}
                  confirm={user.active ? `Deactivate ${user.name}? They will not be able to sign in.` : undefined}
                  action={setStaffActive.bind(null, user.id, !user.active)}
                />
              ) : null}
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <ActionForm action={changeRole} successMessage="Role updated">
                <input type="hidden" name="id" value={user.id} />
                <label className="label" htmlFor={`role-${user.id}`}>
                  Role
                </label>
                <select id={`role-${user.id}`} name="role" className="field" defaultValue={user.role}>
                  <option value="cashier">Cashier</option>
                  <option value="manager">Manager</option>
                </select>
                <button className="btn btn-primary" type="submit">
                  Save role
                </button>
              </ActionForm>
              <ActionForm action={resetPassword} resetOnSuccess successMessage="Password updated">
                <input type="hidden" name="id" value={user.id} />
                <label className="label" htmlFor={`password-${user.id}`}>
                  New password
                </label>
                <input
                  id={`password-${user.id}`}
                  name="password"
                  type="password"
                  className="field"
                  autoComplete="new-password"
                  required
                  minLength={4}
                />
                <label className="label" htmlFor={`confirm-${user.id}`}>
                  Confirm password
                </label>
                <input
                  id={`confirm-${user.id}`}
                  name="confirmPassword"
                  type="password"
                  className="field"
                  autoComplete="new-password"
                  required
                  minLength={4}
                />
                <button className="btn btn-primary" type="submit">
                  Update password
                </button>
              </ActionForm>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
