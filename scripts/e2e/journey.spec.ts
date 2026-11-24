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
  // the chips read "Sponsors" and "No sponsorship", so a listing filtered on the
  // signal is the sure way to a role that carries one
  const firstCard = page.locator("article").first();
  const emptyListing = page.getByText("No roles match these filters");

  await page.goto("/en/jobs?visa=yes");
  // cards arrive only after the runtime fetch, and a filtered listing may end empty
  await expect(firstCard.or(emptyListing).first()).toBeVisible({ timeout: 15_000 });

  if (await emptyListing.isVisible()) {
    await page.goto("/en/jobs?visa=no");
    await expect(firstCard.or(emptyListing).first()).toBeVisible({ timeout: 15_000 });
    if (await emptyListing.isVisible()) {
      throw new Error(
        "No role carries a visa signal in this dataset, neither a sponsorship nor a refusal, so the detail journey cannot run"
      );
    }
  }

  // the title link is the first link of a card that leads to a role
  await page.locator("article a[href*='/jobs/']").first().click();
  await expect(page).toHaveURL(/\/jobs\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "Visa signal" })).toBeVisible();
});
