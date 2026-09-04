import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authenticateLocalCredentials } from "@/lib/auth/local-credentials";
import { resolveWaypostUserId } from "@/lib/users/identity";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      name: "Waypost local development",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const identity = authenticateLocalCredentials(
          credentials.email,
          credentials.password
        );
        if (!identity) return null;
        const waypostUserId = await resolveWaypostUserId(identity.subject);
        return {
          id: waypostUserId,
          waypostUserId,
          subject: identity.subject,
          email: identity.email ?? null,
          name: identity.name ?? identity.email ?? "Waypost user",
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.waypostUserId = user.waypostUserId;
        token.authSubject = user.subject;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.waypostUserId === "string") {
        session.user.waypostUserId = token.waypostUserId;
      }
      return session;
    },
  },
});
