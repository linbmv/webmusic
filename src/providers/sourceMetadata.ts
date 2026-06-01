import { zh } from "@/i18n/zh";
import type { MusicSourceId } from "@/types/music";

interface SourceMetadata {
  tag: string;
  name: string;
  cover: string;
}

const sourceMetadata: Record<MusicSourceId, SourceMetadata> = {
  netease: {
    tag: "NE",
    name: zh.names.netease,
    cover: "rgba(255, 255, 255, 0.08)",
  },
  kuwo: {
    tag: "KW",
    name: zh.names.kuwo,
    cover: "rgba(255, 255, 255, 0.08)",
  },
  qqmusic: {
    tag: "QQ",
    name: zh.names.qqmusic,
    cover: "rgba(255, 255, 255, 0.08)",
  },
  kugou: {
    tag: "KG",
    name: zh.names.kugou,
    cover: "rgba(255, 255, 255, 0.08)",
  },
  joox: {
    tag: "JX",
    name: zh.names.joox,
    cover: "rgba(255, 255, 255, 0.08)",
  },
};

export function getSourceTag(source: MusicSourceId): string {
  return sourceMetadata[source].tag;
}

export function getSourceName(source: MusicSourceId): string {
  return sourceMetadata[source].name;
}

export function getSourceCover(source: MusicSourceId): string {
  return sourceMetadata[source].cover;
}
