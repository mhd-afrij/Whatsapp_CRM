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

  it("classifies a 502 with a recoverable gateway code as recoverable", async () => {
    const { apiClient } = await import("./api-client");
    apiClient.interceptors.request.clear();
    apiClient.interceptors.request.use(() => {
      const error = {
        response: {
          status: 502,
          data: {
            success: false,
            message: "WhatsApp gateway is temporarily unavailable.",
            code: "GATEWAY_UNREACHABLE",
            data: { status: "unavailable", retryable: true },
          },
        },
        isAxiosError: true,
      };
      return Promise.reject(error);
    });

    const { isGatewayRecoverableError } = await import("./api-client");
    await expect(apiClient.get("/whatsapp/status")).rejects.toMatchObject({
      status: 502,
      code: "GATEWAY_UNREACHABLE",
      recoverable: true,
    });

    try {
      await apiClient.get("/whatsapp/status");
    } catch (error) {
      expect(isGatewayRecoverableError(error)).toBe(true);
      expect((error as { data: unknown }).data).toEqual({ status: "unavailable", retryable: true });
    }
  });

  it("keeps a non-gateway 502 as a regular (non-recoverable) failure", async () => {
    const { apiClient } = await import("./api-client");
    apiClient.interceptors.request.clear();
    apiClient.interceptors.request.use(() => {
      const error = {
        response: {
          status: 502,
          data: { success: false, message: "Bad upstream gateway.", code: "UPSTREAM_ERROR" },
        },
        isAxiosError: true,
      };
      return Promise.reject(error);
    });

    const { isGatewayRecoverableError } = await import("./api-client");
    try {
      await apiClient.get("/conversations");
    } catch (error) {
      expect(isGatewayRecoverableError(error)).toBe(false);
      expect((error as { recoverable: boolean }).recoverable).toBe(false);
    }
  });

  it("treats GATEWAY_TIMEOUT and GATEWAY_UNAVAILABLE as recoverable too", async () => {
    const { apiClient, GATEWAY_RECOVERABLE_CODES } = await import("./api-client");

    for (const code of ["GATEWAY_TIMEOUT", "GATEWAY_UNAVAILABLE"]) {
      apiClient.interceptors.request.clear();
      apiClient.interceptors.request.use(() => {
        const error = {
          response: {
            status: 502,
            data: { success: false, message: "Down.", code },
          },
          isAxiosError: true,
        };
        return Promise.reject(error);
      });

      try {
        await apiClient.get("/whatsapp/status");
      } catch (error) {
        expect((error as { recoverable: boolean }).recoverable).toBe(true);
      }
    }

    expect(GATEWAY_RECOVERABLE_CODES.has("GATEWAY_UNREACHABLE")).toBe(true);
    expect(GATEWAY_RECOVERABLE_CODES.has("GATEWAY_UNAUTHORIZED")).toBe(false);
  });
});

describe("unwrap", () => {
  it("treats a success envelope with null data as a successful null, not an error", async () => {
    const { unwrap } = await import("./api-client");

    const result = await unwrap<null>(
      Promise.resolve({
        data: { success: true, message: "Conversation deleted.", data: null },
      })
    );

    expect(result).toBeNull();
  });

  it("still rejects a success:false envelope even when it carries no data", async () => {
    const { unwrap, ApiError } = await import("./api-client");

    await expect(
      unwrap<unknown>(
        Promise.resolve({
          data: { success: false, message: "Forbidden.", data: null },
        })
      )
    ).rejects.toBeInstanceOf(ApiError);
  });
});
