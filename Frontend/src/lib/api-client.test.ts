import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Phase 18: covers the axios 401 interceptor in api-client.ts - a session
 * expiry (revoked/expired token) must clear the stored token, dispatch
 * `auth:session-expired` (so AuthProvider can react), and hard-redirect to
 * /login. This never had direct test coverage before this pass.
 */

vi.mock("./token-store", () => ({
  getToken: vi.fn().mockReturnValue(null),
  clearToken: vi.fn(),
}));

describe("apiClient 401 interceptor", () => {
  let originalLocation: Location;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    originalLocation = window.location;
    // jsdom's window.location is non-configurable, so we replace it with a
    // test-only object that keeps the properties this suite reads.
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, href: "", pathname: "/inbox" } as Location,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
    vi.restoreAllMocks();
  });

  it("clears the token, dispatches auth:session-expired, and redirects to /login on a 401", async () => {
    const { clearToken } = await import("./token-store");
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    const { apiClient } = await import("./api-client");

    // Intercept the outgoing request so no real network call is attempted;
    // resolve it directly with a synthetic 401 axios-shaped error.
    apiClient.interceptors.request.clear();
    apiClient.interceptors.request.use(() => {
      const error = {
        response: {
          status: 401,
          data: { success: false, message: "Unauthenticated." },
        },
        isAxiosError: true,
      };
      return Promise.reject(error);
    });

    await expect(apiClient.get("/conversations")).rejects.toMatchObject({
      status: 401,
      message: "Unauthenticated.",
    });

    expect(clearToken).toHaveBeenCalled();
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: "auth:session-expired" }));
    expect(window.location.href).toContain("/login?from=");
    expect(window.location.href).toContain("reason=session_expired");
  });

  it("does not redirect when the 401 happens while already on /login", async () => {
    window.location.pathname = "/login";
    const { clearToken } = await import("./token-store");

    const { apiClient } = await import("./api-client");
    apiClient.interceptors.request.clear();
    apiClient.interceptors.request.use(() => {
      const error = {
        response: { status: 401, data: { success: false, message: "Unauthenticated." } },
        isAxiosError: true,
      };
      return Promise.reject(error);
    });

    await expect(apiClient.get("/auth/me")).rejects.toBeTruthy();
    expect(clearToken).toHaveBeenCalled();
    expect(window.location.href).toBe("");
  });

  it("leaves the token/session alone and passes through a non-401 error unmodified", async () => {
    const { clearToken } = await import("./token-store");

    const { apiClient } = await import("./api-client");
    apiClient.interceptors.request.clear();
    apiClient.interceptors.request.use(() => {
      const error = {
        response: { status: 500, data: { success: false, message: "Server error." } },
        isAxiosError: true,
      };
      return Promise.reject(error);
    });

    await expect(apiClient.get("/conversations")).rejects.toMatchObject({ status: 500 });
    expect(clearToken).not.toHaveBeenCalled();
  });
});
