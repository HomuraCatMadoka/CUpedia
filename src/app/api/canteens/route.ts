import { NextResponse } from "next/server";
import { getCanteens } from "@/lib/canteen-actions";

export async function GET() {
  const canteens = await getCanteens();
  return NextResponse.json({ canteens });
}
