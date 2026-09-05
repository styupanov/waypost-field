import { NextResponse } from "next/server";
import { authenticatedWaypostUserId } from "@/lib/auth/session";
import { getTripCreditBalance } from "@/lib/credits/repository";

export async function GET() {
  const userId = await authenticatedWaypostUserId();
  if (!userId) return NextResponse.json({ error: { code: "AUTH_REQUIRED", message: "Sign in is required." } }, { status: 401 });
  try { return NextResponse.json({ balance: await getTripCreditBalance(userId), unit: "trip_credit" }); }
  catch { console.error("Trip credit balance could not be loaded."); return NextResponse.json({ error: { code: "CREDIT_BALANCE_UNAVAILABLE", message: "Trip Credit balance is unavailable." } }, { status: 500 }); }
}
