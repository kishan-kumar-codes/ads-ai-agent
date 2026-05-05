import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { SignUpPage } from "../src/pages/SignUp";

function renderPage() {
  return render(
    <MemoryRouter>
      <SignUpPage />
    </MemoryRouter>,
  );
}

describe("SignUpPage", () => {
  it("rejects passwords shorter than 8 characters", async () => {
    renderPage();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^name$/i), "Jane Doe");
    await user.type(screen.getByLabelText(/email/i), "jane@example.com");
    await user.type(screen.getByLabelText(/password/i), "short");
    await user.click(screen.getByRole("button", { name: /sign up/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/at least 8 characters/i);
  });

  it("rejects malformed email", async () => {
    renderPage();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^name$/i), "Jane Doe");
    // Use a value that passes the browser's HTML5 email pattern but fails our stricter check.
    await user.type(screen.getByLabelText(/email/i), "jane@bad");
    await user.type(screen.getByLabelText(/password/i), "longenoughpw");
    await user.click(screen.getByRole("button", { name: /sign up/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/valid email/i);
  });
});
