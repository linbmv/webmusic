// 浏览器端统一 ID 生成：crypto.randomUUID 仅在安全上下文（HTTPS/localhost）可用，
// 受限 WebView、非安全上下文或测试环境可能缺失，需逐级降级保证调用方永不抛错。
export function createClientId(prefix?: string): string {
  const id = randomUuid();
  return prefix ? `${prefix}-${id}` : id;
}

function randomUuid(): string {
  const cryptoApi = globalThis.crypto as Crypto | undefined;
  if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID();
  if (typeof cryptoApi?.getRandomValues === "function") return uuidFromRandomValues(cryptoApi);
  // 最终兜底：无 Web Crypto 时用时间戳+随机数，仅保证唯一性，不保证密码学强度
  return `${Date.now().toString(16)}-${Math.floor(Math.random() * 0xffffffff).toString(16)}`;
}

function uuidFromRandomValues(cryptoApi: Crypto): string {
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  // 按 RFC 4122 v4 设置版本号与变体位
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}
