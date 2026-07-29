import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { LanguageProvider } from "@/lib/i18n/language-provider"
import LanguageToggle from "@/components/language-toggle"
import ThemeToggle from "@/components/theme-toggle"
import { ThemeProvider } from "@/components/theme-provider"

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
    <html lang="ro" suppressHydrationWarning className={`${inter.variable} bg-background`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var c=document.cookie.split(';').find(function(s){return s.trim().startsWith('lang=')});var l=c?c.split('=')[1].trim():localStorage.getItem('lang');if(l==='en')document.documentElement.lang='en';}catch(e){}})()`,
          }}
        />
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
          <LanguageProvider>
            <div className="fixed bottom-4 right-4 z-[100] flex items-center gap-2 print:hidden">
              <ThemeToggle />
              <LanguageToggle />
            </div>
            {children}
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
