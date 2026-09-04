import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { AuthenticatedIdentity } from "@/lib/users/identity";

type LocalUser = AuthenticatedIdentity & { email: string; password: string };

function configuredUser(prefix: "A" | "B"): LocalUser | null {
  const email = process.env[`LOCAL_AUTH_USER_${prefix}_EMAIL`]?.trim();
  const password = process.env[`LOCAL_AUTH_USER_${prefix}_PASSWORD`];
  const subject = process.env[`LOCAL_AUTH_USER_${prefix}_SUBJECT`]?.trim();
  const name = process.env[`LOCAL_AUTH_USER_${prefix}_NAME`]?.trim();
  if (!email || !password || !subject) return null;
  return { email, password, subject, name: name || undefined };
}

function equalSecret(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export function authenticateLocalCredentials(
  email: unknown,
  password: unknown
): AuthenticatedIdentity | null {
  if (process.env.LOCAL_AUTH_ENABLED !== "true") return null;
  if (typeof email !== "string" || typeof password !== "string") return null;
  const normalizedEmail = email.trim().toLowerCase();
  const user = ([configuredUser("A"), configuredUser("B")] as const).find(
    (candidate) => candidate?.email.toLowerCase() === normalizedEmail
  );
  if (!user || !equalSecret(password, user.password)) return null;
  return { subject: user.subject, email: user.email, name: user.name };
}
