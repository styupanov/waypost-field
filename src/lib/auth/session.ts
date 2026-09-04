import "server-only";
import { auth } from "@/auth";

export async function authenticatedWaypostUserId() {
  const session = await auth();
  return session?.user?.waypostUserId ?? null;
}
