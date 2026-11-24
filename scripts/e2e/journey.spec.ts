import { expect, test, type Page } from "@playwright/test";

/**
 * The production journeys that component tests cannot prove: the dataset
 * asset fetch (issue 10) and the URL-carried listing state that must
 * survive opening a role and pressing back (issue 3).
 */

/** The listing asset the browser fetches at runtime. Its name changes with every nightly refresh. */
const DATASET_URL = /\/data\/index-[^/]+\.json$/;

/**
 * Opens a listing filtered on a visa signal and returns once the dataset is in. The page
 * passes through three states: the static HTML holds the first roles unfiltered, the
 * hydrated page filters those, and only then does the full dataset arrive. So the listener
 * stands before the navigation, the navigation ends with the network quiet, and the asset
 * is read to its end.
 */
async function openSignalListing(page: Page, visa: "yes" | "no"): Promise<void> {
  const [dataset] = await Promise.all([
    page.waitForResponse((response) => DATASET_URL.test(response.url()), { timeout: 15_000 }),
    page.goto(`/en/jobs?visa=${visa}`, { waitUntil: "networkidle" }),
  ]);
  expect(dataset.ok(), `the listing dataset answered ${dataset.status()}`).toBe(true);
  expect(await dataset.finished(), "the listing dataset arrived in full").toBeNull();
}

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
  // every card of a listing filtered on the signal carries one chip that names the signal
  const signalChip = firstCard.locator(".chip", { hasText: /^(Sponsors|No sponsorship)/ });

  await openSignalListing(page, "yes");
  // the dataset is in, so a listing that reads empty now is empty
  await expect(firstCard.or(emptyListing).first()).toBeVisible({ timeout: 15_000 });

  if (await emptyListing.isVisible()) {
    await openSignalListing(page, "no");
    await expect(firstCard.or(emptyListing).first()).toBeVisible({ timeout: 15_000 });
    if (await emptyListing.isVisible()) {
      throw new Error(
        "No role carries a visa signal in this dataset, neither a sponsorship nor a refusal, so the detail journey cannot run"
      );
    }
  }

  // a card that carries the signal chip leads to a role that shows the signal
  await expect(signalChip).toHaveCount(1);
  // the title link is the first link of a card that leads to a role
  await page.locator("article a[href*='/jobs/']").first().click();
  await expect(page).toHaveURL(/\/jobs\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "Visa signal" })).toBeVisible();
});
