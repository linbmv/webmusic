import { expect, test } from "@playwright/test";

const providerStorageKey = "music.provider.config.v2";
const mockProviderConfig = JSON.stringify({ activeProviderId: "mock", fallbackProviderIds: ["mock"] });

test("player mode button cycles list, single, and shuffle", async ({ page }) => {
  await page.goto("/discover");
  await page.evaluate(({ key, value }) => {
    localStorage.setItem(key, value);
    localStorage.removeItem("music:player:v1");
  }, { key: providerStorageKey, value: mockProviderConfig });
  await page.reload();

  await page.getByRole("link", { name: "\u8bbe\u7f6e" }).click();
  await page.getByRole("combobox").selectOption("mock");
  await page.getByRole("link", { name: "\u4e3b\u9875" }).click();
  await page.locator(".track-row").filter({ hasText: "\u9634\u5929 (Live)" }).first().click();

  const playerBar = page.locator(".player-bar");
  const modeButton = playerBar.getByRole("button", { name: "\u5217\u8868\u5faa\u73af", exact: true });
  await expect(modeButton).toBeVisible();

  await modeButton.click();
  await expect(playerBar.getByRole("button", { name: "\u5355\u66f2\u5faa\u73af", exact: true })).toBeVisible();

  await playerBar.getByRole("button", { name: "\u5355\u66f2\u5faa\u73af", exact: true }).click();
  await expect(playerBar.getByRole("button", { name: "\u968f\u673a\u64ad\u653e", exact: true })).toBeVisible();

  await playerBar.getByRole("button", { name: "\u968f\u673a\u64ad\u653e", exact: true }).click();
  await expect(playerBar.getByRole("button", { name: "\u5217\u8868\u5faa\u73af", exact: true })).toBeVisible();
});
