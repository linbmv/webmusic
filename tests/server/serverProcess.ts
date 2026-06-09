import type { ChildProcessWithoutNullStreams } from "node:child_process";

const startupTimeoutMs = 10_000;
const outputLimit = 4_000;

export async function waitForServer(child: ChildProcessWithoutNullStreams, url: string): Promise<void> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const onStdout = (chunk: string | Buffer) => stdout.push(String(chunk));
  const onStderr = (chunk: string | Buffer) => stderr.push(String(chunk));
  let onExit: ((code: number | null, signal: NodeJS.Signals | null) => void) | undefined;
  let onError: ((error: Error) => void) | undefined;

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", onStdout);
  child.stderr.on("data", onStderr);

  const exited = new Promise<never>((_, reject) => {
    onExit = (code, signal) => {
      reject(new Error(`Server exited before startup (${formatExit(code, signal)}).\n${formatOutput(stdout, stderr)}`));
    };
    onError = (error) => reject(error);
    child.once("exit", onExit);
    child.once("error", onError);
  });

  try {
    await Promise.race([pollServer(url, () => formatOutput(stdout, stderr)), exited]);
  } finally {
    child.stdout.off("data", onStdout);
    child.stderr.off("data", onStderr);
    if (onExit) child.off("exit", onExit);
    if (onError) child.off("error", onError);
  }
}

async function pollServer(url: string, output: () => string): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < startupTimeoutMs) {
    try {
      const response = await fetch(`${url}/api/auth/me`);
      if (response.ok) return;
    } catch {
      // Server socket is not ready yet.
    }
    await delay(100);
  }
  throw new Error(`Server did not start within ${startupTimeoutMs}ms.\n${output()}`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatExit(code: number | null, signal: NodeJS.Signals | null): string {
  if (code !== null) return `code ${code}`;
  if (signal) return `signal ${signal}`;
  return "unknown exit status";
}

function formatOutput(stdout: string[], stderr: string[]): string {
  return `stdout:\n${tail(stdout.join(""))}\nstderr:\n${tail(stderr.join(""))}`;
}

function tail(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "(empty)";
  return trimmed.slice(-outputLimit);
}
