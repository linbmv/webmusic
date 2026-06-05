import { httpError } from "./http.mjs";

export function matchesProxyPrefix(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function buildProxyUrl(url, options) {
  if (!matchesProxyPrefix(url.pathname, options.prefix)) {
    throw httpError(404, "Music proxy not found");
  }
  const suffix = url.pathname.slice(options.prefix.length);
  const upstreamUrl = new URL(options.baseUrl);
  const basePath = upstreamUrl.pathname.replace(/\/$/, "");
  upstreamUrl.pathname = `${basePath}${suffix}` || "/";
  upstreamUrl.search = "";
  url.searchParams.forEach((value, key) => upstreamUrl.searchParams.append(key, value));
  return upstreamUrl;
}
