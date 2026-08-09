import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionCookie } = vi.hoisted(() => ({ getSessionCookie: vi.fn() }));

vi.mock("better-auth/cookies", () => ({ getSessionCookie }));

import { config, proxy } from "@/proxy";

function request(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost:3000${path}`, { headers });
}

describe("proxy", () => {
  beforeEach(() => {
    getSessionCookie.mockReset();
  });

  describe("locale routing", () => {
    it("prefixes an unprefixed path with the default locale", () => {
      const response = proxy(request("/dashboard"));

      expect(response.headers.get("location")).toBe(
        "http://localhost:3000/en-US/dashboard",
      );
    });

    it("negotiates the locale from Accept-Language", () => {
      const response = proxy(request("/login", { "accept-language": "pt-BR,pt;q=0.9" }));

      expect(response.headers.get("location")).toBe(
        "http://localhost:3000/pt-BR/login",
      );
    });

    it("prefers the cookie over Accept-Language", () => {
      const response = proxy(
        request("/login", {
          "accept-language": "pt-BR,pt;q=0.9",
          cookie: "NEXT_LOCALE=de-DE",
        }),
      );

      expect(response.headers.get("location")).toBe(
        "http://localhost:3000/de-DE/login",
      );
    });

    it("leaves an already-prefixed unprotected path alone", () => {
      const response = proxy(request("/pt-BR/login"));

      expect(response.headers.get("location")).toBeNull();
    });

    it("does not treat an unknown first segment as a locale", () => {
      const response = proxy(request("/fr/dashboard"));

      // Prefixed, not coerced — the resulting route does not exist and 404s.
      expect(response.headers.get("location")).toBe(
        "http://localhost:3000/en-US/fr/dashboard",
      );
    });
  });

  describe("auth gate", () => {
    it("redirects to the login page in the same locale when no session cookie is present", () => {
      getSessionCookie.mockReturnValue(null);

      const response = proxy(request("/de-DE/dashboard"));

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        "http://localhost:3000/de-DE/login",
      );
    });

    it("lets the request through when a cookie is present", () => {
      getSessionCookie.mockReturnValue("some-token");

      const response = proxy(request("/en-US/dashboard"));

      expect(response.headers.get("location")).toBeNull();
    });

    it("does not guard pages other than the dashboard", () => {
      getSessionCookie.mockReturnValue(null);

      const response = proxy(request("/en-US/login"));

      expect(response.headers.get("location")).toBeNull();
    });

    it("is optimistic — it accepts any cookie value without validating it", () => {
      // Documents the security boundary: this check is bypassable by design,
      // which is why app/[locale]/dashboard/page.tsx re-checks against the
      // database.
      getSessionCookie.mockReturnValue("obviously-forged");

      const response = proxy(request("/en-US/dashboard"));

      expect(response.headers.get("location")).toBeNull();
    });
  });

  it("skips API routes, Next internals, and files", () => {
    expect(config.matcher).toEqual(["/((?!api|_next|_vercel|.*\\..*).*)"]);
  });
});
