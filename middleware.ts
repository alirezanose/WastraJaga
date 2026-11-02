import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

export default NextAuth(authConfig).auth;

export const config = {
  matcher: [
    /*
     * Proteksi seluruh rute kecuali:
     * - api/scan (endpoint kamera on-device menggunakan bearer token)
     * - api/auth (NextAuth API)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - mediapipe (wasm & tflite static)
     * - favicon.ico (favicon file)
     */
    "/((?!api/scan|api/auth|_next/static|_next/image|mediapipe|favicon.ico).*)",
  ],
};
