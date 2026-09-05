import { NextResponse } from "next/server";
import { buildOpenApi } from "@/lib/api/openapi";

export const dynamic = "force-dynamic";

// GET /api/v1/openapi.json  (public)
export async function GET() {
  return NextResponse.json(buildOpenApi(), { headers: { "cache-control": "public, max-age=300", "access-control-allow-origin": "*" } });
}
