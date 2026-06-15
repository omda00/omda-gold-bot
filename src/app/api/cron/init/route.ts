import { NextResponse } from "next/server";
import { initCronScheduler, getCronStatus } from "@/lib/cron-scheduler";

let initialized = false;

export async function GET() {
  if (!initialized) {
    initialized = true;
    // Initialize cron in the background
    initCronScheduler();
  }

  return NextResponse.json({
    status: "initialized",
    cron: getCronStatus(),
  });
}
