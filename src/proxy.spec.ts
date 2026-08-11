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

    it("coerces an unknown locale segment and keeps the rest of the path", () => {
      const response = proxy(request("/abc/dashboard"));

      expect(response.headers.get("location")).toBe(
        "http://localhost:3000/en-US/dashboard",
      );
    });

    it("coerces a real-but-unsupported language tag", () => {
      const response = proxy(request("/fr/dashboard"));

      expect(response.headers.get("location")).toBe(
        "http://localhost:3000/en-US/dashboard",
      );
    });

    it("does not invent a region for a bare language subtag", () => {
      // `/de` is not coerced to `de-DE`. Only casing is corrected; everything
      // else falls back. Deliberate — see the spec's non-goals.
      const response = proxy(request("/de/dashboard"));

      expect(response.headers.get("location")).toBe(
        "http://localhost:3000/en-US/dashboard",
      );
    });

    it("resolves the replacement locale from the cookie, not a hardcoded default", () => {
      const response = proxy(
        request("/abc/dashboard", { cookie: "NEXT_LOCALE=de-DE" }),
      );

      expect(response.headers.get("location")).toBe(
        "http://localhost:3000/de-DE/dashboard",
      );
    });

    it("preserves the query string while coercing", () => {
      const response = proxy(request("/abc/dashboard?tab=x&y=2"));

      expect(response.headers.get("location")).toBe(
        "http://localhost:3000/en-US/dashboard?tab=x&y=2",
      );
    });

    it("redirects a coerced path that already carried a valid locale", () => {
      // `/abc/de-DE/x` strips to `/de-DE/x`, which next-intl considers
      // correct and does not redirect. Without a redirect of our own the
      // browser would sit on the bogus URL.
      const response = proxy(request("/abc/de-DE/login"));

      expect(response.headers.get("location")).toBe(
        "http://localhost:3000/de-DE/login",
      );
    });

    it("carries the locale cookie onto that redirect", () => {
      // next-intl sets NEXT_LOCALE on the response it returns for
      // `/de-DE/login`; issuing a bare redirect would throw it away and force
      // renegotiation on the next request.
      const response = proxy(request("/abc/de-DE/login"));

      expect(response.cookies.get("NEXT_LOCALE")?.value).toBe("de-DE");
    });

    it("still prefixes an unprefixed path rather than stripping it", () => {
      // The guard against over-eager stripping: `dashboard` is also an
      // unrecognised first segment, and it must survive.
      const response = proxy(request("/dashboard"));

      expect(response.headers.get("location")).toBe(
        "http://localhost:3000/en-US/dashboard",
      );
    });

    it.each(["/en-us/dashboard", "/EN-US/dashboard"])(
      "redirects %s to the canonical casing",
      (path) => {
        // next-intl's own behaviour, pinned here so an upgrade cannot drop it
        // silently. We deliberately write no code for this.
        const response = proxy(request(path));

        expect(response.headers.get("location")).toBe(
          "http://localhost:3000/en-US/dashboard",
        );
      },
    );

    it("redirects /pt-br/login to the canonical casing", () => {
      const response = proxy(request("/pt-br/login"));

      expect(response.headers.get("location")).toBe(
        "http://localhost:3000/pt-BR/login",
      );
    });

    it("leaves a valid locale with an unknown route to the router", () => {
      // Only the locale segment is coerced. A 404 on a real locale stays a 404.
      const response = proxy(request("/en-US/nonexistent"));

      expect(response.headers.get("location")).toBeNull();
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

    it("carries the NEXT_LOCALE cookie next-intl set onto the login redirect", () => {
      // A request with no incoming NEXT_LOCALE cookie has nothing for
      // next-intl to confirm against, so it syncs one matching the
      // URL's locale on every such response — including this exact
      // no-cookie shape, which is why the redirect above already carries
      // it in practice. Losing it here would force renegotiation on the
      // very next request.
      getSessionCookie.mockReturnValue(null);

      const response = proxy(request("/de-DE/dashboard"));

      expect(response.cookies.get("NEXT_LOCALE")?.value).toBe("de-DE");
    });
  });

  it("skips API routes, Next internals, and files", () => {
    expect(config.matcher).toEqual(["/((?!api|_next|_vercel|.*\\..*).*)"]);
  });
});
