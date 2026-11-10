import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { ToastProvider } from "@/components/ui/overlay";

import "./globals.css";
import { BRAND } from "@/lib/brand";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: `${BRAND.name} — ${BRAND.tagline}`, template: `%s · ${BRAND.name}` },
  description:
    `${BRAND.name} researches public sources to surface emerging trends, unsolved problems and market gaps — with the evidence behind every opportunity.`,
  applicationName: BRAND.name,
  openGraph: {
    title: BRAND.name,
    description: "Discover Opportunities. Verify the Evidence. Stay Ahead.",
    siteName: BRAND.name,
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#121316" },
    { media: "(prefers-color-scheme: light)", color: "#F8F9FB" },
  ],
};

// Applies the saved theme before paint (light is the default).
const themeScript = `try{document.documentElement.dataset.theme=localStorage.getItem('sh-theme')==='dark'?'dark':'light'}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full bg-bg font-sans text-text">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
