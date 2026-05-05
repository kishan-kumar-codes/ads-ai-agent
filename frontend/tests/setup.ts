import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

if (!window.ResizeObserver) {
  class ResizeObserverMock {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }

  Object.defineProperty(window, "ResizeObserver", {
    writable: true,
    value: ResizeObserverMock,
  });
  Object.defineProperty(globalThis, "ResizeObserver", {
    writable: true,
    value: ResizeObserverMock,
  });
}

vi.mock("../src/lib/auth-client", () => {
  const state: { user: { id: string; email: string; name: string } | null } = {
    user: null,
  };
  return {
    authClient: {},
    signIn: {
      email: vi.fn(async ({ email }: { email: string }) => {
        state.user = { id: "u1", email, name: "Test" };
        return { data: { user: state.user } };
      }),
    },
    signUp: {
      email: vi.fn(async ({ email, name }: { email: string; name: string }) => {
        state.user = { id: "u1", email, name };
        return { data: { user: state.user } };
      }),
    },
    signOut: vi.fn(async () => {
      state.user = null;
      return {};
    }),
    useSession: () => ({
      data: state.user ? { user: state.user } : null,
      isPending: false,
    }),
    __setSession(user: typeof state.user) {
      state.user = user;
    },
  };
});
