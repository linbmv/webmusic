import { lookup } from "node:dns/promises";
import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { isIP } from "node:net";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { httpError } from "./http.mjs";

const defaultMaxBytes = 250 * 1024 * 1024;
const defaultTimeoutMs = 30_000;
const maxRedirects = 5;
const allowedPrivateHosts = new Set(splitEnv(process.env.ALLOW_PRIVATE_DOWNLOAD_HOSTS));
const blockedIpv4Cidrs = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
];

export const maxDownloadBytes = positiveInt(process.env.MAX_DOWNLOAD_BYTES, defaultMaxBytes);
export const downloadTimeoutMs = positiveInt(process.env.DOWNLOAD_TIMEOUT_MS, defaultTimeoutMs);

export async function fetchDownloadSource(rawUrl) {
  let currentUrl = await assertAllowedDownloadUrl(rawUrl);
  for (let index = 0; index <= maxRedirects; index += 1) {
    const response = await fetch(currentUrl.href, {
      headers: { "user-agent": "webmusic-downloader/0.1" },
      redirect: "manual",
      signal: AbortSignal.timeout(downloadTimeoutMs),
    });
    if (!isRedirect(response.status)) {
      if (!response.ok || !response.body) throw httpError(502, `Download source failed: ${response.status}`);
      assertSafeResponse(response);
      return response;
    }
    currentUrl = await redirectedUrl(currentUrl, response);
  }
  throw httpError(400, "Download source redirected too many times");
}

export async function writeLimitedResponse(response, filePath) {
  try {
    await pipeline(response.body, byteLimitStream(maxDownloadBytes), createWriteStream(filePath));
  } catch (error) {
    await rm(filePath, { force: true });
    throw error;
  }
}

async function assertAllowedDownloadUrl(rawUrl) {
  const url = parseDownloadUrl(rawUrl);
  if (allowedPrivateHosts.has(url.hostname.toLowerCase())) return url;
  const addresses = await resolveHost(url.hostname);
  if (addresses.some(isBlockedAddress)) throw httpError(400, "Download URL host is private or reserved");
  return url;
}

async function redirectedUrl(currentUrl, response) {
  const location = response.headers.get("location");
  if (!location) throw httpError(502, "Download source redirect is missing location");
  return assertAllowedDownloadUrl(new URL(location, currentUrl).href);
}

function isRedirect(status) {
  return [301, 302, 303, 307, 308].includes(status);
}

function parseDownloadUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("unsupported protocol");
    if (!url.hostname) throw new Error("missing hostname");
    return url;
  } catch {
    throw httpError(400, "audioUrl must be an absolute HTTP(S) URL");
  }
}

async function resolveHost(hostname) {
  if (isIP(hostname)) return [hostname];
  try {
    const records = await lookup(hostname, { all: true, verbatim: false });
    return records.map((item) => item.address);
  } catch {
    throw httpError(400, "Download URL host could not be resolved");
  }
}

function assertSafeResponse(response) {
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > maxDownloadBytes) throw httpError(413, "Downloaded audio is too large");
  const type = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (type && !isAllowedContentType(type)) throw httpError(415, "Download source is not an audio stream");
}

function isAllowedContentType(type) {
  return type.startsWith("audio/") || type.includes("octet-stream") || type.includes("mpegurl");
}

function byteLimitStream(limitBytes) {
  let total = 0;
  return new Transform({
    transform(chunk, _encoding, callback) {
      total += chunk.length;
      if (total > limitBytes) callback(httpError(413, "Downloaded audio is too large"));
      else callback(null, chunk);
    },
  });
}

function isBlockedAddress(address) {
  const version = isIP(address);
  if (version === 4) return isBlockedIpv4(address);
  if (version === 6) return isBlockedIpv6(address);
  return true;
}

function isBlockedIpv4(address) {
  const value = ipv4ToInt(address);
  return blockedIpv4Cidrs.some(([base, prefix]) => inIpv4Cidr(value, ipv4ToInt(base), prefix));
}

function ipv4ToInt(address) {
  return address.split(".").reduce((value, part) => (value << 8) + Number(part), 0) >>> 0;
}

function inIpv4Cidr(value, base, prefix) {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (base & mask);
}

function isBlockedIpv6(address) {
  const value = address.toLowerCase();
  if (value === "::" || value === "::1" || value.startsWith("fe80:")) return true;
  if (value.startsWith("fc") || value.startsWith("fd") || value.startsWith("2001:db8:")) return true;
  if (value.startsWith("::ffff:")) return isBlockedIpv4(value.slice(7));
  return false;
}

function splitEnv(value = "") {
  return value.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
