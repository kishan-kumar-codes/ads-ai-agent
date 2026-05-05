import { describe, it, expect, beforeEach } from "vitest";
import { useTheme } from "../src/store/theme";

describe("theme store", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
    useTheme.getState().setTheme("light");
  });

  it("toggles between light and dark and updates the html class", () => {
    const { toggle } = useTheme.getState();
    expect(useTheme.getState().theme).toBe("light");
    toggle();
    expect(useTheme.getState().theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    toggle();
    expect(useTheme.getState().theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
