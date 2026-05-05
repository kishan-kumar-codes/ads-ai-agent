import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "../src/components/ProtectedRoute";
import * as authClient from "../src/lib/auth-client";

function renderApp() {
  return render(
    <MemoryRouter initialEntries={["/private"]}>
      <Routes>
        <Route
          path="/private"
          element={
            <ProtectedRoute>
              <div>secret-area</div>
            </ProtectedRoute>
          }
        />
        <Route path="/signin" element={<div>signin-page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute", () => {
  beforeEach(() => {
    (authClient as any).__setSession(null);
  });

  it("redirects to /signin when no session", () => {
    renderApp();
    expect(screen.getByText("signin-page")).toBeInTheDocument();
    expect(screen.queryByText("secret-area")).not.toBeInTheDocument();
  });

  it("renders children when authenticated", () => {
    (authClient as any).__setSession({ id: "u1", email: "a@b.c", name: "A" });
    renderApp();
    expect(screen.getByText("secret-area")).toBeInTheDocument();
  });
});
