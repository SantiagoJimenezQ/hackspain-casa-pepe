import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { BROWSER_SESSION_COOKIE, validBrowserToken } from "@/lib/browser-session";

/** Establish identity on the document response, before parallel dashboard requests start. */
export function proxy(request: NextRequest) {
  const token = request.cookies.get(BROWSER_SESSION_COOKIE)?.value;
  if (validBrowserToken(token)) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ message: "Refresh the page to create a browser session." }, { status: 401 });
  }
  const response = NextResponse.next();
  response.cookies.set(BROWSER_SESSION_COOKIE, randomBytes(32).toString("hex"), {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = { matcher: ["/((?!_next|.*\\.).*)"] };
