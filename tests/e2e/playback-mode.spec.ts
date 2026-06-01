import { expect, test } from "@playwright/test";

test("player mode button cycles list, single, and shuffle", async ({ page }) => {
  await page.goto("/discover");

  await page.getByRole("link", { name: "\u8bbe\u7f6e" }).click();
  await page.getByRole("combobox").selectOption("mock");
  await page.getByRole("link", { name: "\u4e3b\u9875" }).click();
  await page.getByText("\u9634\u5929 (Live)").first().click();

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
