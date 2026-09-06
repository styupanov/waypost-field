import TripPlanner from "@/components/trip/TripPlanner";
import { auth } from "@/auth";
import { parseExploreIntent } from "@/lib/trip/explore-intent";

export default async function Home({ searchParams }: { searchParams: Promise<{ trip?: string; mode?: string; intent?: string; area?: string; areaRes?: string; lat?: string; lng?: string }> }) {
  const [session, params] = await Promise.all([auth(), searchParams]);
  const exploreIntent = session?.user && params.mode === "planner" && !params.trip ? parseExploreIntent(params) : null;
  return (
    <main className="app-shell">
      <TripPlanner initialSession={session?.user ?? null} requestedTripId={params.trip ?? null} requestedMode={params.mode ?? null} exploreIntent={exploreIntent} />
    </main>
  );
}
