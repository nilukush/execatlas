import { describe, afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

const replace = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/jobs",
  useRouter: () => ({ replace, push: vi.fn(), prefetch: vi.fn() }),
}));

import { LanguageSwitcher } from "./language-switcher";
import en from "../messages/en.json";

function renderSwitcher() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <LanguageSwitcher />
    </NextIntlClientProvider>
  );
}

describe("LanguageSwitcher", () => {
  afterEach(() => {
    cleanup();
    replace.mockClear();
  });

  it("lists every locale in its own script with the current one selected", () => {
    renderSwitcher();
    const select = screen.getByLabelText("Change language") as HTMLSelectElement;
    expect(select.value).toBe("en");
    for (const name of ["English", "हिन्दी", "العربية", "Bahasa Indonesia"]) {
      expect(screen.getByRole("option", { name })).toBeInTheDocument();
    }
  });

  it("navigates to the same path in the chosen locale", () => {
    renderSwitcher();
    fireEvent.change(screen.getByLabelText("Change language"), { target: { value: "ar" } });
    expect(replace).toHaveBeenCalledWith("/jobs", { locale: "ar" });
  });
});
