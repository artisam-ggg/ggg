import { describe, it, expect, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { withAuth } from "next-auth/middleware";

vi.mock("next-auth/middleware", () => ({
  withAuth: vi.fn((fn, options) => {
    return Object.assign(
      async (req: NextRequest) => {
        const token = req.headers.get("x-test-token");
        const authorized = options?.callbacks?.authorized?.({ token, req }) ?? true;

        if (!authorized) {
          return NextResponse.redirect(new URL("/login", req.url));
        }

        return fn(req);
      },
      { config: options },
    ) as ReturnType<typeof withAuth>;
  }),
}));

const mod = (await import("../middleware")) as unknown as {
  default: (req: NextRequest) => Promise<Response>;
  config: { matcher: string[] };
};
const { default: middleware, config } = mod;

describe("middleware", () => {
  describe("config.matcher", () => {
    it("excludes static assets", () => {
      expect(config.matcher).toEqual(["/((?!_next/static|_next/image|favicon.ico).*)"]);
    });
  });

  describe("authentication gate", () => {
    it("redirects unauthenticated from /tournaments", async () => {
      const req = new NextRequest(new URL("http://localhost/tournaments"));
      const res = await middleware(req);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/login");
    });

    it("redirects unauthenticated from /tournaments/new", async () => {
      const req = new NextRequest(new URL("http://localhost/tournaments/new"));
      const res = await middleware(req);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/login");
    });

    it("redirects unauthenticated from /tournaments/abc/settle", async () => {
      const req = new NextRequest(new URL("http://localhost/tournaments/abc/settle"));
      const res = await middleware(req);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/login");
    });

    it("redirects unauthenticated from /admin", async () => {
      const req = new NextRequest(new URL("http://localhost/admin"));
      const res = await middleware(req);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/login");
    });

    it("allows authenticated to /tournaments", async () => {
      const req = new NextRequest(new URL("http://localhost/tournaments"));
      req.headers.set("x-test-token", "valid-token");
      const res = await middleware(req);
      expect(res.status).toBe(200);
    });

    it("allows authenticated to /tournaments/abc/settle", async () => {
      const req = new NextRequest(new URL("http://localhost/tournaments/abc/settle"));
      req.headers.set("x-test-token", "valid-token");
      const res = await middleware(req);
      expect(res.status).toBe(200);
    });

    it("does not cache authenticated /tournaments/new", async () => {
      const req = new NextRequest(new URL("http://localhost/tournaments/new"));
      req.headers.set("x-test-token", "valid-token");
      const res = await middleware(req);
      expect(res.headers.get("Cache-Control")).toBe("no-store, max-age=0");
    });
  });

  describe("public paths", () => {
    it("allows public /tournaments/abc", async () => {
      const req = new NextRequest(new URL("http://localhost/tournaments/abc"));
      const res = await middleware(req);
      expect(res.status).toBe(200);
    });

    it("allows public /tournaments/abc/anything", async () => {
      const req = new NextRequest(new URL("http://localhost/tournaments/abc/anything"));
      const res = await middleware(req);
      expect(res.status).toBe(200);
    });
  });

  describe("security headers", () => {
    it("applies security headers to all responses", async () => {
      const req = new NextRequest(new URL("http://localhost/tournaments/abc"));
      const res = await middleware(req);
      expect(res.headers.get("Content-Security-Policy")).toBeTruthy();
      expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    });
  });
});
