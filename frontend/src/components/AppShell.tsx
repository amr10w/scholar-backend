"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AuthProvider } from "@/src/features/auth/AuthContext";
import Footer from "./Footer";
import Header from "./Header";

const authRoutes = ["/login", "/signup"];

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const isAuthRoute = authRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  return (
    <AuthProvider>
      {isAuthRoute ? (
        <>{children}</>
      ) : (
        <>
          <Header />
          {children}
          <Footer />
        </>
      )}
    </AuthProvider>
  );
}
