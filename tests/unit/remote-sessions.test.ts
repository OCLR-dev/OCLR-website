import { afterEach, expect, it, vi } from "vitest";
import {
  connectRemote,
  disconnectRemote,
  remoteConnection,
  verifiedConnection,
} from "../../src/lib/remote-sessions";
import { remoteCredentialVault } from "../../src/lib/remote-credential-vault";
import { remoteRead } from "../../src/lib/remote-transport";
import { RemoteDataError } from "../../src/lib/remote-errors";
vi.mock("../../src/lib/remote-transport", () => ({ remoteRead: vi.fn() }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it("keeps authenticated ciphertext in entries, revalidates with the credential and clears on disconnect", async () => {
  const token = `oclr_dev_${"Q".repeat(43)}`;
  const now = Date.now();
  const expiry = now + 3600000;
  vi.mocked(remoteRead).mockResolvedValue({
    data: {
      user: { osuId: 1, username: "Synthetic" },
      access: {
        kind: "developer-read",
        scopes: ["identity:read"],
        expiresAt: new Date(expiry).toISOString(),
      },
    },
  } as never);
  const { id, expiresAt } = await connectRemote({ mode: "developer", token });
  try {
    const stored = remoteConnection(id);
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(stored).not.toHaveProperty("token");
    expect(expiresAt).toBe(expiry);
    vi.spyOn(Date, "now").mockReturnValue(now + 20 * 60 * 1000);
    expect((await verifiedConnection(id)).identity?.user.osuId).toBe(1);
    expect(remoteRead).toHaveBeenLastCalledWith("/me", undefined, token);
    const sealed = stored.sealedToken!;
    disconnectRemote(id);
    expect(sealed.every((byte: number) => byte === 0)).toBe(true);
    expect(() => remoteConnection(id)).toThrow();
  } finally {
    disconnectRemote(id);
  }
});
it("expires at the backend credential expiry", async () => {
  const expiry = Date.now() + 5000;
  vi.mocked(remoteRead).mockResolvedValue({
    data: {
      user: { osuId: 1, username: "Synthetic" },
      access: {
        kind: "developer-read",
        scopes: [],
        expiresAt: new Date(expiry).toISOString(),
      },
    },
  } as never);
  const { id, expiresAt } = await connectRemote({
    mode: "developer",
    token: `oclr_dev_${"R".repeat(43)}`,
  });
  expect(expiresAt).toBe(expiry);
  vi.spyOn(Date, "now").mockReturnValue(expiry);
  expect(() => remoteConnection(id)).toThrow();
});
it("keeps explicit anonymous browsing connected without a local time limit", async () => {
  vi.mocked(remoteRead).mockResolvedValue({ data: {} } as never);
  const { id, expiresAt } = await connectRemote({ mode: "anonymous" });
  try {
    expect(expiresAt).toBeNull();
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 7 * 24 * 3600000);
    expect((await verifiedConnection(id)).mode).toBe("anonymous");
    expect(remoteRead).toHaveBeenLastCalledWith("/site");
    expect(remoteConnection(id).sealedToken).toBeUndefined();
  } finally {
    disconnectRemote(id);
  }
});
it.each(["anonymous", "developer"] as const)(
  "reclaims the least recently used anonymous connection for new %s access",
  async (mode) => {
    let now = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => now);
    vi.mocked(remoteRead).mockResolvedValue({ data: {} } as never);
    const ids: string[] = [];
    try {
      for (let index = 0; index < 50; index++) {
        ids.push((await connectRemote({ mode: "anonymous" })).id);
        now++;
      }
      // The oldest created connection is still in use; reclaim the next one.
      remoteConnection(ids[0]);
      const abandonedCache = remoteConnection(ids[1]).publicCache!;
      const clear = vi.spyOn(abandonedCache, "clear");
      now++;
      remoteConnection(ids[0]);
      // Make every other connection more recent than the abandoned one.
      for (const id of ids.slice(2)) {
        now++;
        remoteConnection(id);
      }
      if (mode === "developer")
        vi.mocked(remoteRead).mockResolvedValue({
          data: {
            user: { osuId: 1, username: "Synthetic" },
            access: {
              kind: "developer-read",
              scopes: [],
              expiresAt: new Date(now + 3600000).toISOString(),
            },
          },
        } as never);
      ids.push(
        (
          await connectRemote({
            mode,
            token:
              mode === "developer" ? `oclr_dev_${"T".repeat(43)}` : undefined,
          })
        ).id,
      );
      expect(() => remoteConnection(ids[1])).toThrow();
      expect(clear).toHaveBeenCalledOnce();
      for (const id of ids.filter((id) => id !== ids[1]))
        expect(remoteConnection(id)).toBeDefined();
      expect(remoteConnection(ids.at(-1)).mode).toBe(mode);
    } finally {
      ids.forEach(disconnectRemote);
    }
  },
);
it("preserves Developer connections at capacity and allows replacing an existing connection", async () => {
  vi.mocked(remoteRead).mockResolvedValue({
    data: {
      user: { osuId: 1, username: "Synthetic" },
      access: {
        kind: "developer-read",
        scopes: [],
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
    },
  } as never);
  const input = {
    mode: "developer" as const,
    token: `oclr_dev_${"U".repeat(43)}`,
  };
  const ids: string[] = [];
  try {
    for (let index = 0; index < 50; index++)
      ids.push((await connectRemote(input)).id);
    const sealed = remoteConnection(ids[0]).sealedToken!;
    await expect(connectRemote({ mode: "anonymous" })).rejects.toMatchObject({
      status: 503,
    });
    await expect(connectRemote(input)).rejects.toMatchObject({ status: 503 });
    for (const id of ids) expect(remoteConnection(id).mode).toBe("developer");
    expect(sealed.some((byte: number) => byte !== 0)).toBe(true);
    ids.push((await connectRemote(input, ids[0])).id);
    expect(() => remoteConnection(ids[0])).toThrow();
    expect(sealed.every((byte: number) => byte === 0)).toBe(true);
    expect(remoteConnection(ids.at(-1)).mode).toBe("developer");
  } finally {
    ids.forEach(disconnectRemote);
  }
});
it("replaces stale cleanup on module reload without losing live connections", async () => {
  const state = globalThis as typeof globalThis & {
    oclrRemoteSessionCleanup?: ReturnType<typeof setInterval>;
  };
  if (state.oclrRemoteSessionCleanup)
    clearInterval(state.oclrRemoteSessionCleanup);
  vi.useFakeTimers();
  vi.mocked(remoteRead).mockResolvedValue({ data: {} } as never);
  const { id } = await connectRemote({ mode: "anonymous" });
  const before = remoteConnection(id);
  // Reproduce the old policy that treats null expiry as already expired.
  state.oclrRemoteSessionCleanup = setInterval(
    () => disconnectRemote(id),
    60_000,
  );
  try {
    vi.resetModules();
    const reloaded = await import("../../src/lib/remote-sessions");
    await vi.advanceTimersByTimeAsync(120_000);
    expect(reloaded.remoteConnection(id)).toBe(before);
    expect((await reloaded.verifiedConnection(id)).mode).toBe("anonymous");
  } finally {
    disconnectRemote(id);
    clearInterval(state.oclrRemoteSessionCleanup);
    delete state.oclrRemoteSessionCleanup;
  }
});
it.each([401, 403])(
  "removes Developer access after backend rejection %s",
  async (status) => {
    vi.mocked(remoteRead).mockResolvedValue({
      data: {
        user: { osuId: 1, username: "Synthetic" },
        access: {
          kind: "developer-read",
          scopes: [],
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        },
      },
    } as never);
    const { id } = await connectRemote({
      mode: "developer",
      token: `oclr_dev_${"S".repeat(43)}`,
    });
    const sealed = remoteConnection(id).sealedToken!;
    vi.mocked(remoteRead).mockRejectedValueOnce(
      new RemoteDataError("REMOTE_EXPIRED", status),
    );
    await expect(verifiedConnection(id)).rejects.toThrow();
    expect(sealed.every((byte: number) => byte === 0)).toBe(true);
    expect(() => remoteConnection(id)).toThrow();
  },
);
it("authenticates ciphertext and uses distinct nonces", () => {
  const first = remoteCredentialVault.seal("synthetic");
  expect(remoteCredentialVault.seal("synthetic")).not.toEqual(first);
  first[first.length - 1] ^= 1;
  expect(() => remoteCredentialVault.open(first)).toThrow();
});
