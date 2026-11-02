import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = nextUrl;

      // Proteksi /admin -> hanya role admin
      if (pathname.startsWith("/admin")) {
        if (!isLoggedIn) return false;
        return auth.user?.role === "admin";
      }

      // Proteksi /dashboard -> officer dan admin
      if (pathname.startsWith("/dashboard")) {
        if (!isLoggedIn) return false;
        return auth.user?.role === "officer" || auth.user?.role === "admin";
      }

      // Jika sudah login dan mencoba akses /login, arahkan ke /dashboard
      if (pathname === "/login" && isLoggedIn) {
        return Response.redirect(new URL("/dashboard", nextUrl));
      }

      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.templeId = user.templeId;
      }
      return token;
    },
    session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "officer" | "admin";
        session.user.templeId = token.templeId as string | null | undefined;
      }
      return session;
    },
  },
  providers: [], // Diisi di lib/auth.ts bersama Credentials provider
};
