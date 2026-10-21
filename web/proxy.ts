import { NextResponse, type NextRequest } from "next/server";
import { headersOf, refuseNonLocal } from "../src/dashboard/local.ts";

/**
 * Every request, pages included: only localhost, and writes only from this UI's
 * own pages (see src/dashboard/local.ts). The API routes check again themselves.
 */
export function proxy(request: NextRequest) {
  const write = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  const reason = refuseNonLocal(headersOf(request), write);
  if (reason) return new NextResponse(reason, { status: 403, headers: { "content-type": "text/plain" } });
  return NextResponse.next();
}
