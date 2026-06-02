import { ProviderError } from "@/providers/MusicProvider";
import type { ProviderId } from "@/types/music";

export interface HttpClientOptions {
  baseUrl: string;
  providerId: ProviderId;
  timeoutMs: number;
}

type QueryPrimitive = string | number | boolean;
type QueryValue = QueryPrimitive | readonly QueryPrimitive[] | undefined;

interface Envelope<T> {
  code?: number;
  message?: string;
  data?: T;
}

export class FetchHttpClient {
  constructor(private readonly options: HttpClientOptions) {}

  async getJson<T>(path: string, params: Record<string, QueryValue> = {}): Promise<T> {
    const response = await this.request(path, params);
    return response.json() as Promise<T>;
  }

  async getData<T>(path: string, params: Record<string, QueryValue> = {}): Promise<T> {
    const envelope = await this.getJson<Envelope<T>>(path, params);
    if (envelope.code !== undefined && envelope.code !== 0) {
      throw new ProviderError(envelope.message ?? `Provider returned code ${envelope.code}`, this.options.providerId, envelope.code);
    }
    return envelope.data as T;
  }

  async getText(path: string, params: Record<string, QueryValue> = {}): Promise<string> {
    const response = await this.request(path, params);
    return response.text();
  }

  private async request(path: string, params: Record<string, QueryValue>): Promise<Response> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      const response = await fetch(this.buildUrl(path, params), { signal: controller.signal });
      if (!response.ok) {
        throw new ProviderError(`Provider request failed: ${response.status}`, this.options.providerId, response.status);
      }
      return response;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError("Provider request aborted or failed", this.options.providerId, undefined, error);
    } finally {
      window.clearTimeout(timer);
    }
  }

  private buildUrl(path: string, params: Record<string, QueryValue>): string {
    const url = new URL(`${this.options.baseUrl}${path}`, window.location.origin);
    Object.entries(params).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((item) => url.searchParams.append(key, String(item)));
        return;
      }
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    });
    return url.toString();
  }
}
