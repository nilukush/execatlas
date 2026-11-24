import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import type { DatasetStats, Job } from "@/lib/types";
import StatsPage from "./page";
import en from "@/messages/en.json";

type Namespace = "Stats";

// the page reads the dataset and the request translations, and a unit test has neither
const dataset = vi.hoisted(() => ({ jobs: [] as Job[], stats: null as DatasetStats | null }));
vi.mock("@/lib/data", () => ({
  getAllJobIds: () => dataset.jobs.map((job) => job.id),
  getJobById: (id: string) => dataset.jobs.find((job) => job.id === id) ?? null,
  getStats: () => dataset.stats,
}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: () => undefined,
  getTranslations: async (namespace: Namespace | { namespace: Namespace }) =>
    createTranslator({
      locale: "en",
      messages: en,
      namespace: typeof namespace === "string" ? namespace : namespace.namespace,
    }),
}));

afterEach(cleanup);

describe("stats page carried note", () => {
  const stats = (carried?: DatasetStats["carried"]): DatasetStats => ({
    generatedAt: "2026-11-24T03:17:00.000Z",
    total: 1108,
    bySource: {},
    byRegion: {},
    byVisa: {},
    countries: 12,
    ...(carried ? { carried } : {}),
  });

  async function renderStats() {
    const page = await StatsPage({ params: Promise.resolve({ locale: "en" }) });
    return render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        {page}
      </NextIntlClientProvider>
    );
  }

  it("counts the roles kept from the previous refresh after a source failed to answer", async () => {
    dataset.stats = stats({ total: 5, bySource: { adzuna: 5 } });
    await renderStats();
    expect(
      screen.getByText("5 roles are kept from the previous refresh after a source failed to answer.")
    ).toBeInTheDocument();
  });

  it("shows no line for a dataset that kept no role, and for one written before the count existed", async () => {
    dataset.stats = stats({ total: 0, bySource: {} });
    await renderStats();
    expect(screen.queryByText(/kept from the previous refresh/)).toBeNull();

    cleanup();
    dataset.stats = stats();
    await renderStats();
    expect(screen.queryByText(/kept from the previous refresh/)).toBeNull();
  });
});
