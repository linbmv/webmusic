import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { waitForServer } from "./serverProcess";

let server: ChildProcessWithoutNullStreams | null = null;
let dataDir = "";
let baseUrl = "";

describe("download server", () => {
  beforeEach(async () => {
    await startServer();
  });

  afterEach(async () => {
    await stopServer();
    server = null;
    await rm(dataDir, { recursive: true, force: true });
  });

  it("stores logged-in downloads inside the user's data directory", async () => {
    const auth = await register("bob");
    const sourceServer = await startAudioSource();
    try {
      const result = await createDownload(auth.cookie, "s1", sourceServer.url);

      expect(result.download.sizeBytes).toBeGreaterThan(0);
      const file = await readFile(downloadPath(auth.user.id, "s1"), "utf8");
      expect(file).toBe("audio-bytes");
    } finally {
      await sourceServer.close();
    }
  });

  it("rejects private download urls", async () => {
    const auth = await register("carol");

    const response = await postDownload(auth.cookie, testSong(), "http://10.0.0.1/song.mp3");

    expect(response.status).toBe(400);
  });

  it("rejects redirects to private download urls", async () => {
    const auth = await register("dave");
    const redirectServer = await startRedirectSource("http://10.0.0.1/song.mp3");
    try {
      const response = await postDownload(auth.cookie, testSong(), redirectServer.url);

      expect(response.status).toBe(400);
    } finally {
      await redirectServer.close();
    }
  });

  it("rejects downloads that would exceed the user quota and removes the oversized asset", async () => {
    await stopServer();
    await rm(dataDir, { recursive: true, force: true });
    await startServer({ MAX_USER_DOWNLOAD_BYTES: "15" });
    const auth = await register("quota");
    const sourceServer = await startAudioSource("audio-bytes");
    try {
      await createDownload(auth.cookie, "s1", sourceServer.url);

      const response = await postDownload(auth.cookie, testSong("s2"), sourceServer.url);

      expect(response.status).toBe(507);
      await expect(readFile(downloadPath(auth.user.id, "s2"), "utf8")).rejects.toThrow();
      const downloads = await request<{ downloads: unknown[]; totalBytes: number }>("/api/me/downloads", { cookie: auth.cookie });
      expect(downloads.downloads).toHaveLength(1);
      expect(downloads.totalBytes).toBe("audio-bytes".length);
    } finally {
      await sourceServer.close();
    }
  });

  it("re-downloads an asset when its database row exists but the file is missing", async () => {
    const auth = await register("missingfile");
    const sourceServer = await startAudioSource("first-audio");
    try {
      await createDownload(auth.cookie, "s1", sourceServer.url);
    } finally {
      await sourceServer.close();
    }
    await rm(downloadPath(auth.user.id, "s1"), { force: true });
    const replacementServer = await startAudioSource("replacement-audio");
    try {
      const result = await createDownload(auth.cookie, "s1", replacementServer.url);

      expect(result.download.sizeBytes).toBe("replacement-audio".length);
      expect(await readFile(downloadPath(auth.user.id, "s1"), "utf8")).toBe("replacement-audio");
    } finally {
      await replacementServer.close();
    }
  });

  it("serves suffix byte ranges and rejects unsatisfiable ranges", async () => {
    const auth = await register("ranges");
    const sourceServer = await startAudioSource("audio-bytes");
    try {
      const result = await createDownload(auth.cookie, "s1", sourceServer.url);

      const suffix = await fetch(`${baseUrl}/api/me/downloads/${result.download.id}/stream`, {
        headers: { cookie: auth.cookie, range: "bytes=-5" },
      });
      expect(suffix.status).toBe(206);
      expect(suffix.headers.get("content-range")).toBe("bytes 6-10/11");
      expect(await suffix.text()).toBe("bytes");

      const unsatisfiable = await fetch(`${baseUrl}/api/me/downloads/${result.download.id}/stream`, {
        headers: { cookie: auth.cookie, range: "bytes=99-" },
      });
      expect(unsatisfiable.status).toBe(416);
      expect(unsatisfiable.headers.get("content-range")).toBe("bytes */11");
    } finally {
      await sourceServer.close();
    }
  });
});

async function startServer(extraEnv: Record<string, string> = {}): Promise<void> {
  dataDir = await mkdtemp(join(tmpdir(), "webmusic-download-test-"));
  const port = 18_080 + Math.floor(Math.random() * 1000);
  baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["--experimental-sqlite", "server.mjs"], {
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
  server = child;
  await waitForServer(child, baseUrl);
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

async function createDownload(cookie: string, id: string, audioUrl: string): Promise<{ download: { id: string; sizeBytes: number } }> {
  return request("/api/me/downloads", { method: "POST", cookie, body: { song: testSong(id), quality: "128kmp3", audioUrl } });
}

async function postDownload(cookie: string, song: ReturnType<typeof testSong>, audioUrl: string): Promise<Response> {
  return fetch(`${baseUrl}/api/me/downloads`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ song, quality: "128kmp3", audioUrl }),
  });
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

async function startAudioSource(body = "audio-bytes"): Promise<{ url: string; close: () => Promise<void> }> {
  const { createServer } = await import("node:http");
  const httpServer = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "audio/mpeg" });
    res.end(body);
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

function testSong(id = "s1") {
  return {
    stableId: `mock:netease:song:${id}`,
    providerSongId: id,
    provider: { providerId: "mock" as const, source: "netease" as const },
    name: "Song",
    artists: ["Artist"],
    artistText: "Artist",
    raw: {},
  };
}

function downloadPath(userId: string, songId: string): string {
  return join(dataDir, "downloads", userId, "mock", "netease", songId, "128kmp3.mp3");
}
