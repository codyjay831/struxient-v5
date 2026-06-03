import NextAuth from "next-auth";
import { NextResponse, type NextRequest } from "next/server";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

const AUTH_PAGES = new Set(["/login", "/signup"]);

function isPublicPath(pathname: string) {
  return (
    pathname === "/" ||
    AUTH_PAGES.has(pathname) ||
    pathname === "/request" ||
    pathname.startsWith("/request/") ||
    pathname === "/q" ||
    pathname.startsWith("/q/") ||
    pathname.startsWith("/api/auth")
  );
}

function isFilePath(pathname: string) {
  return pathname.includes(".");
}

export default auth((req: NextRequest & { auth: unknown }) => {
  const { pathname, search } = req.nextUrl;
  const isAuthenticated = Boolean(req.auth);

  if (isFilePath(pathname) || pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  if (pathname === "/" && isAuthenticated) {
    return NextResponse.redirect(new URL("/workstation", req.url));
  }

  if (AUTH_PAGES.has(pathname) && isAuthenticated) {
    return NextResponse.redirect(new URL("/workstation", req.url));
  }

  if (!isAuthenticated && !isPublicPath(pathname) && !pathname.startsWith("/api")) {
    const callbackUrl = `${pathname}${search}`;
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", callbackUrl);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
