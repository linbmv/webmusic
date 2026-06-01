import { defaultProviderConfig, mergeProviderConfig } from "@/config/providerConfig";
import { CustomProvider } from "@/providers/CustomProvider";
import { FreeMusicProvider } from "@/providers/FreeMusicProvider";
import { GdStudioProvider } from "@/providers/GdStudioProvider";
import { KarpovProvider } from "@/providers/KarpovProvider";
import type { MusicProvider } from "@/providers/MusicProvider";
import { MockProvider } from "@/providers/MockProvider";
import type { ProviderId, ProviderRuntimeConfig } from "@/types/music";

export class ProviderRegistry {
  private readonly providers = new Map<ProviderId, MusicProvider>();
  private readonly config: ProviderRuntimeConfig;

  constructor(config: Partial<ProviderRuntimeConfig> = defaultProviderConfig) {
    this.config = mergeProviderConfig(config);
    this.register(new MockProvider());
    this.register(new FreeMusicProvider(this.config.providers.freeMusic, this.config.useBffProxy));
    this.register(new KarpovProvider(this.config.providers.karpov, this.config.useBffProxy));
    this.register(new GdStudioProvider(this.config.providers.gdStudio, this.config.useBffProxy));
    this.register(new CustomProvider(this.config.providers.custom));
  }

  register(provider: MusicProvider): void {
    this.providers.set(provider.id, provider);
  }

  getActive(): MusicProvider {
    return this.get(this.config.activeProviderId);
  }

  get(id: ProviderId): MusicProvider {
    const provider = this.providers.get(id);
    if (!provider) throw new Error(`Provider not registered: ${id}`);
    return provider;
  }

  list(): MusicProvider[] {
    return Array.from(this.providers.values()).filter((provider) => this.config.providers[provider.id]?.enabled ?? true);
  }

  getFallbacks(): MusicProvider[] {
    return this.config.fallbackProviderIds.map((id) => this.get(id)).filter((provider) => this.config.providers[provider.id]?.enabled);
  }
}

export function createProviderRegistry(config: Partial<ProviderRuntimeConfig> = defaultProviderConfig): ProviderRegistry {
  return new ProviderRegistry(config);
}
