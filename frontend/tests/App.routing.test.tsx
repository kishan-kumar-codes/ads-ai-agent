import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "../src/App";

function renderAt(path: string) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("App routing", () => {
  it("renders home at /", () => {
    renderAt("/");
    expect(screen.getByRole("heading", { name: /ai marketing agent/i })).toBeInTheDocument();
  });

  it("renders signup at /signup", () => {
    renderAt("/signup");
    expect(screen.getByRole("heading", { name: /create your account/i })).toBeInTheDocument();
  });

  it("renders signin at /signin", () => {
    renderAt("/signin");
    expect(screen.getByRole("heading", { name: /^sign in$/i })).toBeInTheDocument();
  });

  it("renders not-found for unknown routes", () => {
    renderAt("/totally-bogus");
    expect(screen.getByRole("heading", { name: /page not found/i })).toBeInTheDocument();
  });
});
