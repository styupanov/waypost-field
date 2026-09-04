import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      waypostUserId: string;
    };
  }
}

declare module "next-auth" {
  interface User {
    waypostUserId: string;
    subject: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    waypostUserId?: string;
    authSubject?: string;
  }
}
