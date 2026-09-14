import { describe, afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CompanyLogo } from "./company-logo";

describe("CompanyLogo", () => {
  afterEach(cleanup);

  it("renders a monogram from the first two words when there is no logo", () => {
    const { container } = render(<CompanyLogo name="Blackbird Systems" />);
    expect(container.textContent).toBe("BS");
  });

  it("falls back to the monogram when the image fails to load", () => {
    const { container } = render(<CompanyLogo name="Dutch Corp" logoUrl="https://cdn.example/logo.png" />);
    const img = container.querySelector("img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("https://cdn.example/logo.png");

    fireEvent.error(img);
    expect(container.textContent).toBe("DC");
  });

  it("keeps the monogram decorative and asks nothing of screen readers", () => {
    const { container } = render(<CompanyLogo name="Acme" />);
    const monogram = container.querySelector("div[aria-hidden='true']");
    expect(monogram).not.toBeNull();
  });

  it("renders a question mark for an empty name", () => {
    const { container } = render(<CompanyLogo name="  " />);
    expect(container.textContent).toBe("?");
  });
});
