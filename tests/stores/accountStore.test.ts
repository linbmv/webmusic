import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as accountApi from "@/services/accountApi";
import { useAccountStore } from "@/stores/accountStore";

vi.mock("@/services/accountApi", () => ({
  getMe: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  getLibrary: vi.fn(),
  saveLibrary: vi.fn(),
  listDownloads: vi.fn(),
  createServerDownload: vi.fn(),
}));

const user = { id: "u1", username: "alice", createdAt: 1 };
const emptyLibrary = { favorites: [], playlists: [], recents: [] };

describe("accountStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(accountApi.listDownloads).mockResolvedValue({ downloads: [], totalBytes: 0 });
    vi.mocked(accountApi.getLibrary).mockResolvedValue({ library: emptyLibrary, updatedAt: null });
    vi.clearAllMocks();
  });

  it("does not replace local library automatically after sign in", async () => {
    vi.mocked(accountApi.login).mockResolvedValue(user);

    await useAccountStore().signIn("alice", "secret1");

    expect(useAccountStore().syncStatus).toBe("idle");
    expect(accountApi.getLibrary).toHaveBeenCalledTimes(1);
  });

  it("rejects pulling an empty missing server snapshot", async () => {
    const account = useAccountStore();
    account.user = user;

    await expect(account.pullLibrary()).rejects.toThrow("No server library snapshot to pull");
  });
});
