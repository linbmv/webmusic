import { describe, expect, it } from "vitest";
import { getSourceName, getSourceTag } from "@/providers/sourceMetadata";

describe("sourceMetadata", () => {
  it("maps all supported sources to explicit UI labels", () => {
    expect(getSourceTag("netease")).toBe("NE");
    expect(getSourceTag("kuwo")).toBe("KW");
    expect(getSourceTag("qqmusic")).toBe("QQ");
    expect(getSourceTag("kugou")).toBe("KG");
    expect(getSourceTag("joox")).toBe("JX");
    expect(getSourceName("joox")).toBe("JOOX");
  });
});
