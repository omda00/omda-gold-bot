"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { DirectionProvider } from "@radix-ui/react-direction";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <DirectionProvider dir="rtl">
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        {children}
        <Toaster position="top-right" richColors closeButton />
      </ThemeProvider>
    </DirectionProvider>
  );
}
