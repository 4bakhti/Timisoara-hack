import type { Metadata, Viewport } from "next";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  // One page serves both languages, so the description carries both.
  description: `${APP_TAGLINE.en} / ${APP_TAGLINE.ro}`,
  applicationName: APP_NAME,
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }] },
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
