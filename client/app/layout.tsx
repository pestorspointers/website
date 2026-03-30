import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Pestor's Pointers",
    template: "%s | Pestor's Pointers",
  },
  description:
    "I can help you find your purpose, place in this world & true fulfillment. Let's get unstuck — step into the life you were destined to live.",
  metadataBase: new URL(process.env.NEXTAUTH_URL ?? 'https://pestorspointers.com'),
  openGraph: {
    siteName: "Pestor's Pointers",
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
