import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Veridict — De la suspiciune, la certitudine matematică",
  description:
    "Platformă academică de verificare a integrității lucrărilor. Acces restricționat exclusiv conturilor autorizate.",
  keywords: ["veridict", "integritate academică", "verificare lucrări", "plagiat"],
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: "#001F3F",
  colorScheme: "dark",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ro" className={`${inter.variable} bg-background`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
