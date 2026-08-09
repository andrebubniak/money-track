import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionCookie } = vi.hoisted(() => ({ getSessionCookie: vi.fn() }));

vi.mock("better-auth/cookies", () => ({ getSessionCookie }));

import { config, proxy } from "@/proxy";

describe("proxy", () => {
  beforeEach(() => {
    getSessionCookie.mockReset();
  });

  it("redirects to login when no session cookie is present", () => {
    getSessionCookie.mockReturnValue(null);

    const response = proxy(new NextRequest("http://localhost:3000/dashboard"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/login");
  });

  it("lets the request through when a cookie is present", () => {
    getSessionCookie.mockReturnValue("some-token");

    const response = proxy(new NextRequest("http://localhost:3000/dashboard"));

    expect(response.headers.get("location")).toBeNull();
  });

  it("only guards the dashboard", () => {
    expect(config.matcher).toEqual(["/dashboard"]);
  });

  it("is optimistic — it accepts any cookie value without validating it", () => {
    // Documents the security boundary: this check is bypassable by design,
    // which is why app/dashboard/page.tsx re-checks against the database.
    getSessionCookie.mockReturnValue("obviously-forged");

    const response = proxy(new NextRequest("http://localhost:3000/dashboard"));

    expect(response.headers.get("location")).toBeNull();
  });
});
