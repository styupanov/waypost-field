<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Waypost & Field engineering constraints

- Routing geometry, time, and distance must come only from routing engines.
- The frontend must never call Valhalla directly.
- Hide third-party APIs behind Waypost-owned contracts.
- Configure infrastructure endpoints with environment variables.
- Treat planned and traveled as distinct states.
- Generate fog coverage only after explicit confirmation that travel occurred.
- Keep domain logic out of UI code where practical.
- Do not redesign the architecture without justification.
- Treat HERE route content as provider-controlled temporary content. Waypost permanently owns the trip, version, ordered itinerary, stop snapshots, preferences, day structure, and user choices; any bounded HERE provider cache belongs to a separate checkpoint.
