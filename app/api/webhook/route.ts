// app/api/webhook/route.ts
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  console.log("FCWEED MiniKit webhook payload:", body);
  return NextResponse.json({ ok: true });
}
