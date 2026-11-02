import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    role?: "officer" | "admin";
    templeId?: string | null;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: "officer" | "admin";
      templeId?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: "officer" | "admin";
    templeId?: string | null;
  }
}
