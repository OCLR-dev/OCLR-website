import { createRoot } from "react-dom/client";
import { Suspense, use, useState } from "react";
import { NextIntlClientProvider } from "next-intl";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  RevokeRole,
  StaffPublicVisibility,
  StaffRoleForm,
} from "../../src/components/staff-role-form";
import { StaffReadOnlyContext } from "../../src/components/staff-read-only";
import hant from "../../messages/zh-Hant.json";
import "../../src/app/globals.css";
import "../../src/app/pastel-theme.css";

const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get("theme") ?? "light";
document.documentElement.dataset.appearance = "cute-pastel";

function RefreshCommit({ gate }: { gate: Promise<void> | null }) {
  if (gate) use(gate);
  return null;
}

function Harness() {
  const [gate, setGate] = useState<Promise<void> | null>(null);
  const router: AppRouterInstance = {
    back() {},
    forward() {},
    refresh() {
      document.documentElement.dataset.refreshes = String(
        Number(document.documentElement.dataset.refreshes ?? 0) + 1,
      );
      setGate(
        new Promise<void>((resolve) => {
          window.addEventListener("finish-refresh", () => resolve(), {
            once: true,
          });
        }),
      );
    },
    push() {},
    replace() {},
    prefetch() {},
    bfcacheId: "synthetic",
  };
  return (
    <AppRouterContext.Provider value={router}>
      <NextIntlClientProvider locale="zh-Hant" messages={hant} timeZone="UTC">
        <Suspense fallback={<p>Refreshing synthetic roles</p>}>
          <RefreshCommit gate={gate} />
          <main className="themed-site private-site" style={{ padding: 16 }}>
            {params.has("actions") ? (
              <StaffReadOnlyContext value={params.has("readonly")}>
                <article className="panel staff-role-group staff-card">
                  <div className="staff-role-row">
                    <div className="staff-role-row-info">
                      <strong>Mappooler</strong>
                      <p className="muted">Synthetic staff · osu! ID 12345</p>
                    </div>
                    <div className="staff-role-actions">
                      <StaffPublicVisibility
                        id="synthetic-grant"
                        username="Synthetic staff"
                        role="mappooler"
                        scope={null}
                        published={!params.has("private")}
                      />
                      <RevokeRole
                        id="synthetic-grant"
                        username="Synthetic staff"
                        role="mappooler"
                        scope={null}
                      />
                    </div>
                  </div>
                </article>
              </StaffReadOnlyContext>
            ) : (
              <StaffRoleForm
                editions={[]}
                scopes={null}
                existing={{
                  userId: 12345,
                  editionSlug: null,
                  grants: [{ id: "synthetic-grant", role: "mappooler" }],
                }}
              />
            )}
          </main>
        </Suspense>
      </NextIntlClientProvider>
    </AppRouterContext.Provider>
  );
}
createRoot(document.getElementById("root")!).render(<Harness />);
