import { expect, test } from "@playwright/test";

const searchPlaceholder = "搜索歌曲、歌单、歌手、专辑";

test("music shell renders final top bar and player", async ({ page }) => {
  await page.goto("/discover");

  // 顶部全局搜索框取代了旧的逐页大标题
  const toolbar = page.locator(".fm-toolbar");
  const search = page.getByPlaceholder(searchPlaceholder);
  await expect(search).toBeVisible();
  await expect(toolbar.getByRole("link", { name: "主页" })).toBeVisible();
  await expect(toolbar.getByRole("link", { name: "歌单" })).toBeVisible();
  await expect(toolbar.getByRole("link", { name: "设置" })).toBeVisible();
  await expect(toolbar.getByRole("link", { name: "我的" })).toBeVisible();

  // 设置页切换到确定性的 mock provider，避免搜索/播放断言依赖外网速度
  await toolbar.getByRole("link", { name: "设置" }).click();
  await page.getByRole("combobox").selectOption("mock");
  await toolbar.getByRole("link", { name: "主页" }).click();

  // 聚焦全局搜索框会路由到搜索页
  await search.focus();
  await expect(page).toHaveURL(/\/search/);
  await expect(page.getByRole("button", { name: /单曲/ })).toBeVisible();
  await search.fill("阴天");
  await search.press("Enter");
  await expect(page.getByText(/找到 \d+ 首歌曲/)).toBeVisible();
  await page.getByRole("button", { name: /单曲/ }).click();
  await expect(page.getByRole("button", { name: /单曲/ })).toHaveClass(/active/);
  await page.getByRole("button", { name: /播放全部/ }).click();
  await expect(page.getByLabel("播放控制")).toBeVisible();
  await page.getByRole("button", { name: /专辑/ }).click();
  await expect(page.getByRole("button", { name: /专辑/ })).toHaveClass(/active/);
  await search.focus();
  await expect(page).toHaveURL(/\/search/);

  // 榜单并入发现页内容区，不再作为顶部按钮
  await toolbar.getByRole("link", { name: "主页" }).click();
  await page.getByRole("link", { name: /更多/ }).first().click();
  await expect(page.getByRole("heading", { name: "榜单", exact: true })).toBeVisible();

  // 回到发现页，播放首曲，验证播放控制出现
  await toolbar.getByRole("link", { name: "主页" }).click();
  await page.getByText("阴天 (Live)").first().click();
  await expect(page.getByLabel("播放控制")).toBeVisible();
  await expect(page.locator(".player-bar .bar-copy strong")).toHaveText("阴天 (Live)");
});

test("track row playback keeps the surrounding queue", async ({ page }) => {
  await page.goto("/discover");

  const toolbar = page.locator(".fm-toolbar");
  const search = page.getByPlaceholder(searchPlaceholder);
  await toolbar.getByRole("link", { name: "设置" }).click();
  await page.getByRole("combobox").selectOption("mock");
  await search.focus();
  await page.getByRole("button", { name: /单曲/ }).click();
  await search.fill("not-in-mock-library");
  await search.press("Enter");

  await expect(page.getByText(/找到 2 首歌曲/)).toBeVisible();
  await page.locator(".track-row").filter({ hasText: "阴天 (Live)" }).first().click();
  await expect(page.locator(".player-bar .bar-copy strong")).toHaveText("阴天 (Live)");
  await page.locator(".player-bar").getByRole("button", { name: "下一首" }).click();
  await expect(page.locator(".player-bar .bar-copy strong")).toHaveText("玻璃");
});
