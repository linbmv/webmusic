import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let server: ChildProcessWithoutNullStreams | null = null;
let dataDir = "";
let baseUrl = "";

describe("sync server", () => {
  beforeEach(async () => {
    await startServer();
  });

  afterEach(async () => {
    await stopServer();
    server = null;
    await rm(dataDir, { recursive: true, force: true });
  });

  it("registers a user and syncs the library snapshot", async () => {
    const auth = await register("alice");

    await request("/api/me/library", {
      method: "PUT",
      cookie: auth.cookie,
      body: { library: { favorites: [], playlists: [{ id: "p1", name: "A", trackIds: [], updatedAt: 1 }], recents: [] } },
    });
    const result = await request<{ library: { playlists: Array<{ id: string; name: string }> } }>("/api/me/library", { cookie: auth.cookie });

    expect(result.library.playlists).toEqual([{ id: "p1", name: "A", trackIds: [], updatedAt: 1 }]);
  });

  it("round-trips a v2 snapshot with the song catalog", async () => {
    const auth = await register("songcat");
    const song = testSong();

    await request("/api/me/library", {
      method: "PUT",
      cookie: auth.cookie,
      body: { library: { version: 2, songs: [song], favorites: [], playlists: [{ id: "p1", name: "Mix", trackIds: [song.stableId], updatedAt: 2 }], recents: [] } },
    });
    const result = await request<{ library: { version: number; songs: Array<{ stableId: string }> } }>("/api/me/library", { cookie: auth.cookie });

    expect(result.library.version).toBe(2);
    expect(result.library.songs.map((item) => item.stableId)).toEqual([song.stableId]);
  });

  it("normalizes a v1 upload and preserves the previously stored song catalog", async () => {
    const auth = await register("legacy");
    const song = testSong();

    // 先以 v2 写入歌曲目录
    await request("/api/me/library", {
      method: "PUT",
      cookie: auth.cookie,
      body: { library: { version: 2, songs: [song], favorites: [song], playlists: [], recents: [] } },
    });
    // 再以旧 v1 客户端上传（无 songs 字段）：服务端应规范化为 v2 且不清空已有歌曲目录
    const updated = await request<{ library: { version: number; songs: Array<{ stableId: string }> } }>("/api/me/library", {
      method: "PUT",
      cookie: auth.cookie,
      body: { library: { favorites: [song], playlists: [], recents: [] } },
    });

    expect(updated.library.version).toBe(2);
    expect(updated.library.songs.map((item) => item.stableId)).toContain(song.stableId);
  });

  it("omits the Secure cookie attribute on plain HTTP", async () => {
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "plainhttp", password: "secret1" }),
    });
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("wm_session=");
    expect(setCookie).not.toContain("Secure");
  });

  it("adds the Secure cookie attribute behind an https forwarding proxy", async () => {
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-proto": "https" },
      body: JSON.stringify({ username: "secureproxy", password: "secret1" }),
    });
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("Secure");
  });

  it("exposes registration enabled by default via /api/config", async () => {
    const result = await request<{ registrationEnabled: boolean }>("/api/config");
    expect(result.registrationEnabled).toBe(true);
  });

  it("disables registration when REGISTRATION_ENABLED=false", async () => {
    await stopServer();
    await rm(dataDir, { recursive: true, force: true });
    await startServer({ REGISTRATION_ENABLED: "false" });

    const config = await request<{ registrationEnabled: boolean }>("/api/config");
    expect(config.registrationEnabled).toBe(false);

    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "blocked", password: "secret1" }),
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "用户注册已禁用" });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("stores logged-in downloads inside the user's data directory", async () => {
    const auth = await register("bob");
    const sourceServer = await startAudioSource();
    try {
      const result = await request<{ download: { id: string; sizeBytes: number } }>("/api/me/downloads", {
        method: "POST",
        cookie: auth.cookie,
        body: { song: testSong(), quality: "128kmp3", audioUrl: sourceServer.url },
      });

      expect(result.download.sizeBytes).toBeGreaterThan(0);
      const file = await readFile(join(dataDir, "downloads", auth.user.id, "mock", "netease", "s1", "128kmp3.mp3"), "utf8");
      expect(file).toBe("audio-bytes");
    } finally {
      await sourceServer.close();
    }
  });

  it("rejects private download urls", async () => {
    const auth = await register("carol");

    const response = await fetch(`${baseUrl}/api/me/downloads`, {
      method: "POST",
      headers: {
        cookie: auth.cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ song: testSong(), quality: "128kmp3", audioUrl: "http://10.0.0.1/song.mp3" }),
    });

    expect(response.status).toBe(400);
  });

  it("rejects redirects to private download urls", async () => {
    const auth = await register("dave");
    const redirectServer = await startRedirectSource("http://10.0.0.1/song.mp3");
    try {
      const response = await fetch(`${baseUrl}/api/me/downloads`, {
        method: "POST",
        headers: {
          cookie: auth.cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ song: testSong(), quality: "128kmp3", audioUrl: redirectServer.url }),
      });

      expect(response.status).toBe(400);
    } finally {
      await redirectServer.close();
    }
  });
});

async function startServer(extraEnv: Record<string, string> = {}): Promise<void> {
  dataDir = await mkdtemp(join(tmpdir(), "webmusic-test-"));
  const port = 18_080 + Math.floor(Math.random() * 1000);
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["--experimental-sqlite", "server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      DATA_DIR: dataDir,
      DOWNLOAD_DIR: join(dataDir, "downloads"),
      ALLOW_PRIVATE_DOWNLOAD_HOSTS: "127.0.0.1",
      ...extraEnv,
    },
    stdio: "pipe",
  });
  await waitForServer(baseUrl);
}

async function register(username: string): Promise<{ cookie: string; user: { id: string } }> {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password: "secret1" }),
  });
  expect(response.status).toBe(201);
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  const body = await response.json() as { user: { id: string } };
  return { cookie, user: body.user };
}

async function request<T = unknown>(path: string, options: { method?: string; cookie?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.body ? { "content-type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(body));
  return body as T;
}

async function waitForServer(url: string): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 10_000) {
    try {
      const response = await fetch(`${url}/api/auth/me`);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error("Server did not start");
}

async function stopServer(): Promise<void> {
  if (!server) return;
  const child = server;
  server = null;
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill();
  await new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
    setTimeout(() => resolve(), 5_000);
  });
}

async function startAudioSource(): Promise<{ url: string; close: () => Promise<void> }> {
  const { createServer } = await import("node:http");
  const httpServer = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "audio/mpeg" });
    res.end("audio-bytes");
  });
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const address = httpServer.address();
  if (typeof address !== "object" || !address) throw new Error("Missing audio server address");
  return {
    url: `http://127.0.0.1:${address.port}/song.mp3`,
    close: () => new Promise((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve())),
  };
}

async function startRedirectSource(location: string): Promise<{ url: string; close: () => Promise<void> }> {
  const { createServer } = await import("node:http");
  const httpServer = createServer((_req, res) => {
    res.writeHead(302, { location });
    res.end();
  });
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const address = httpServer.address();
  if (typeof address !== "object" || !address) throw new Error("Missing redirect server address");
  return {
    url: `http://127.0.0.1:${address.port}/redirect.mp3`,
    close: () => new Promise((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve())),
  };
}

function testSong() {
  return {
    stableId: "mock:netease:song:s1",
    providerSongId: "s1",
    provider: { providerId: "mock", source: "netease" },
    name: "Song",
    artists: ["Artist"],
    artistText: "Artist",
    raw: {},
  };
}
