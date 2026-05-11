import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pulse",
  description: "Pulse starter operations workspace for R2 Communications"
};

const themeScript = `
(() => {
  try {
    const theme = window.localStorage.getItem("pulse.theme");
    if (theme === "dark" || theme === "light") {
      document.documentElement.dataset.theme = theme;
    }
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
    <html lang="en">
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
      <body>{children}</body>
    </html>
  );
}
