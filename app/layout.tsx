import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { LanguageProvider } from "@/lib/i18n/language-provider"
import LanguageToggle from "@/components/language-toggle"

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
      <head>
        {/* Anti-flash: read lang cookie before React hydrates */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var c=document.cookie.split(';').find(function(s){return s.trim().startsWith('lang=')});var l=c?c.split('=')[1].trim():localStorage.getItem('lang');if(l==='en')document.documentElement.lang='en';}catch(e){}})()`,
          }}
        />
      </head>
      <body className="font-sans antialiased">
        <LanguageProvider>
          <LanguageToggle />
          {children}
        </LanguageProvider>
      </body>
    </html>
  )
}
