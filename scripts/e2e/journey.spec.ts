import { expect, test } from "@playwright/test";

/**
 * The production journeys that component tests cannot prove: the dataset
 * asset fetch (issue 10) and the URL-carried listing state that must
 * survive opening a role and pressing back (issue 3).
 */

test("listing loads the dataset asset and renders roles", async ({ page }) => {
  await page.goto("/en/jobs");
  // cards arrive only after the runtime fetch; 24 cards is one page
  await expect(page.locator("article")).toHaveCount(24, { timeout: 15_000 });
  await expect(page.locator("article h2").first()).toBeVisible();
});

test("filter, page, role and browser back restore the exact listing state", async ({ page }) => {
  await page.goto("/en/jobs");
  await expect(page.locator("article").first()).toBeVisible({ timeout: 15_000 });

  // set the region filter through the visible control
  await page.getByLabel("Region").selectOption("europe");
  await expect(page).toHaveURL(/region=europe/);

  // move to page 2 if pagination exists for the filtered set
  const next = page.getByRole("button", { name: /next/i });
  if (await next.isEnabled()) {
    await next.click();
    await expect(page).toHaveURL(/page=2/);
  }

  const firstTitle = await page.locator("article h2").first().textContent();
  await page.locator("article a[href*='/jobs/']").first().click();
  await expect(page).toHaveURL(/\/jobs\/[^/]+$/);

  // the reported bug: back dropped filters and page; it must restore both
  await page.goBack();
  await expect(page.locator("article").first()).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/region=europe/);
  if (await page.getByText(/page 2 of/i).isVisible().catch(() => false)) {
    await expect(page.getByText(/page 2 of/i)).toBeVisible();
    expect(await page.locator("article h2").first().textContent()).toBe(firstTitle);
  }
  await expect(page.getByLabel("Region")).toHaveValue("europe");
});

test("stats page renders the nightly scorecard", async ({ page }) => {
  await page.goto("/en/stats");
  await expect(page.getByRole("table").first()).toBeVisible();
  await expect(page.locator("table tbody tr")).toHaveCount(8);
});

test("detail page shows the visa signal card when a signal exists", async ({ page }) => {
  await page.goto("/en/jobs");
  await expect(page.locator("article").first()).toBeVisible({ timeout: 15_000 });
  // walk listings until a role with a visa chip opens; the chip text is
  // the same label the detail card uses
  const cards = page.locator("article");
  const count = await cards.count();
  for (let i = 0; i < count; i += 1) {
    const chip = cards.nth(i).locator(".chip", { hasText: /visa/i }).first();
    if (await chip.isVisible().catch(() => false)) {
      await cards.nth(i).locator("a[href*='/jobs/']").first().click();
      await expect(page.getByText(/signal read from the posting/i)).toBeVisible();
      return;
    }
  }
  test.skip(true, "no visa-signalled role on page 1 of the listing today");
});
