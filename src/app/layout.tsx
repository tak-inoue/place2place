import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://place2place.vercel.app"),
  title: "Place2Place",
  description: "街のイメージを集め、エリアどうしの近さを可視化するWebアプリ",
  openGraph: {
    title: "Place2Place",
    description: "街のイメージを集め、エリアどうしの近さを可視化するWebアプリ",
    url: "https://place2place.vercel.app",
    siteName: "Place2Place",
    type: "website",
    images: [
      {
        url: "/image.png",
        width: 1200,
        height: 630,
        alt: "Place2Place",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Place2Place",
    description: "街のイメージを集め、エリアどうしの近さを可視化するWebアプリ",
    images: ["/image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
