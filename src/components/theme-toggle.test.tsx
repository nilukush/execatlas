import { describe, afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ThemeToggle } from "./theme-toggle";
import en from "../messages/en.json";

function renderToggle() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ThemeToggle />
    </NextIntlClientProvider>
  );
}

describe("ThemeToggle", () => {
  afterEach(() => {
    cleanup();
    document.documentElement.className = "";
    window.localStorage.clear();
  });

  it("reads the theme from the document on mount", () => {
    document.documentElement.classList.add("dark");
    renderToggle();
    expect(screen.getByRole("button", { name: "Toggle dark mode" }).getAttribute("aria-pressed")).toBe(
      "true"
    );
  });

  it("toggles the document class and persists the choice", () => {
    renderToggle();
    const button = screen.getByRole("button", { name: "Toggle dark mode" });

    fireEvent.click(button);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem("ea-theme")).toBe("dark");

    fireEvent.click(button);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(window.localStorage.getItem("ea-theme")).toBe("light");
  });
});
