import TripPlanner from "@/components/trip/TripPlanner";
import { auth } from "@/auth";

export default async function Home({ searchParams }: { searchParams: Promise<{ trip?: string; mode?: string }> }) {
  const [session, params] = await Promise.all([auth(), searchParams]);
  return (
    <main className="app-shell">
      <TripPlanner initialSession={session?.user ?? null} requestedTripId={params.trip ?? null} requestedMode={params.mode ?? null} />
    </main>
  );
}
