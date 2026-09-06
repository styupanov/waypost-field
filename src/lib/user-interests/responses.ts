import "server-only";
import { loadUserInterestProfile, replaceUserInterestProfile } from "./repository.ts";
import { parseUserInterestUpdate } from "./validation.ts";

const unauthorized = () => Response.json({ error: { code: "AUTH_REQUIRED", message: "Sign in is required." } }, { status: 401 });

function profileResponse(interests: Awaited<ReturnType<typeof loadUserInterestProfile>>["interests"]) {
  return { selectedCategories: interests.map(({ category }) => category) };
}

export async function getUserInterestsResponse(userId: string | null) {
  if (!userId) return unauthorized();
  try { return Response.json(profileResponse((await loadUserInterestProfile(userId)).interests)); }
  catch { console.error("User interests could not be loaded."); return Response.json({ error: { code: "INTERESTS_UNAVAILABLE", message: "Your interests are unavailable." } }, { status: 500 }); }
}

export async function putUserInterestsResponse(userId: string | null, request: Request) {
  if (!userId) return unauthorized();
  let value: unknown;
  try { value = await request.json(); } catch { return Response.json({ error: { code: "INVALID_INTERESTS", message: "Selected interests are invalid." } }, { status: 400 }); }
  const categories = parseUserInterestUpdate(value);
  if (!categories) return Response.json({ error: { code: "INVALID_INTERESTS", message: "Selected interests are invalid." } }, { status: 400 });
  try { return Response.json(profileResponse((await replaceUserInterestProfile(userId, categories)).interests)); }
  catch { console.error("User interests could not be saved."); return Response.json({ error: { code: "INTERESTS_SAVE_FAILED", message: "Your interests could not be saved." } }, { status: 500 }); }
}
