import NextAuth from "next-auth";
import Cognito from "next-auth/providers/cognito";
import Credentials from "next-auth/providers/credentials";

import { authenticateLocalCredentials } from "@/lib/auth/local-credentials";
import { resolveWaypostUserId } from "@/lib/users/identity";

const cognitoClientId = process.env.AUTH_COGNITO_ID;
const cognitoClientSecret = process.env.AUTH_COGNITO_SECRET;
const cognitoIssuer = process.env.AUTH_COGNITO_ISSUER;

const cognitoConfigured =
  Boolean(cognitoClientId) &&
  Boolean(cognitoClientSecret) &&
  Boolean(cognitoIssuer);

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: {
    strategy: "jwt",
  },

  providers: [
    ...(cognitoConfigured
      ? [
          Cognito({
            clientId: cognitoClientId!,
            clientSecret: cognitoClientSecret!,
            issuer: cognitoIssuer!,
          }),
        ]
      : []),

    Credentials({
      name: "Waypost local development",

      credentials: {
        email: {
          label: "Email",
          type: "email",
        },
        password: {
          label: "Password",
          type: "password",
        },
      },

      async authorize(credentials) {
        const identity = authenticateLocalCredentials(
          credentials.email,
          credentials.password
        );

        if (!identity) {
          return null;
        }

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
    async jwt({ token, user, account, profile }) {
      /*
       * Cognito OAuth login.
       *
       * Cognito's stable user identifier is `sub`.
       * We use it as public.users.auth_subject.
       */
      if (
        account?.provider === "cognito" &&
        profile &&
        typeof profile.sub === "string"
      ) {
        const authSubject = profile.sub;

        token.waypostUserId = await resolveWaypostUserId(authSubject);
        token.authSubject = authSubject;

        return token;
      }

      /*
       * Temporary local Credentials login.
       *
       * Keep this until Cognito has been verified in AWS.
       */
      if (user) {
        if (typeof user.waypostUserId === "string") {
          token.waypostUserId = user.waypostUserId;
        }

        if (typeof user.subject === "string") {
          token.authSubject = user.subject;
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (
        session.user &&
        typeof token.waypostUserId === "string"
      ) {
        session.user.waypostUserId = token.waypostUserId;
      }

      return session;
    },
  },
});
