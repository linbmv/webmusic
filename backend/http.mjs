export async function readJson(req, limitBytes = 1_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limitBytes) throw httpError(413, "Request body too large");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw httpError(400, "Invalid JSON body");
  }
}

export function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    ...headers,
  });
  res.end(JSON.stringify(body));
}

export function sendText(res, status, body, headers = {}) {
  res.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    ...headers,
  });
  res.end(body);
}

export function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function requireMethod(req, method) {
  if (req.method !== method) throw httpError(405, "Method not allowed");
}

export function parseCookies(header = "") {
  const cookies = new Map();
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies.set(key, decodeURIComponent(value));
  }
  return cookies;
}

export function sessionCookie(token, maxAgeSeconds, options = {}) {
  return `wm_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secureSuffix(options)}`;
}

export function clearSessionCookie(options = {}) {
  return `wm_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureSuffix(options)}`;
}

// HTTPS 下必须带 Secure，否则部分移动浏览器/PWA 会丢弃 Cookie 导致登录态/同步失效；
// 本地 HTTP 开发不能带 Secure，否则浏览器拒收。通过请求协议或环境变量判定。
export function isSecureRequest(req) {
  if (process.env.COOKIE_SECURE === "true") return true;
  if (process.env.COOKIE_SECURE === "false") return false;
  const forwardedProto = String(req.headers["x-forwarded-proto"] ?? "").split(",")[0].trim();
  if (forwardedProto) return forwardedProto === "https";
  return Boolean(req.socket?.encrypted);
}

function secureSuffix(options) {
  return options.secure ? "; Secure" : "";
}
