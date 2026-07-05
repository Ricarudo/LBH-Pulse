import type { Metadata } from "next";
import { PulseShell } from "@/components/PulseShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pulse",
  description: "Pulse starter operations workspace for R2 Communications"
};

const themeScript = `
(() => {
  try {
    const mode = window.localStorage.getItem("pulse.themeMode") || "system";
    const accent = window.localStorage.getItem("pulse.accentTheme") || "blue";
    const motion = window.localStorage.getItem("pulse.motionMode") || "luxurious";
    const theme = mode === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : mode;
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.accent = accent;
    document.documentElement.dataset.motion = motion;
  } catch {
  }
})();
`;

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <PulseShell>{children}</PulseShell>
      </body>
    </html>
  );
}
