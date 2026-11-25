import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import { RevealController } from "@/components/motion/reveal-controller";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["SOFT", "WONK"],
});

export const metadata: Metadata = {
  title: "X RPL 1 — Jadwal & Tugas Kelas",
  description:
    "Pusat informasi Kelas X RPL 1: jadwal pelajaran yang berganti otomatis setiap pukul 19.00 WIB, daftar tugas, dan pengumuman kelas.",
};

export const viewport: Viewport = {
  themeColor: "#fbfaf7",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${inter.variable} ${fraunces.variable}`}>
      <head>
        {/*
          Arm scroll-reveal before first paint so elements never flash in at
          full opacity and then jump back. If the controller never mounts, the
          timeout reveals everything, so content can never stay stuck invisible.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{" +
              "var d=document.documentElement;" +
              "if(!('IntersectionObserver' in window))return;" +
              "if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;" +
              "d.classList.add('reveal-ready');" +
              "setTimeout(function(){if(d.classList.contains('reveal-live'))return;" +
              "d.classList.remove('reveal-ready');" +
              "var n=d.querySelectorAll('[data-reveal]');" +
              "for(var i=0;i<n.length;i++)n[i].setAttribute('data-reveal','shown');" +
              "},2500);" +
              "}catch(e){}})();",
          }}
        />
      </head>
      <body>
        <RevealController />
        {children}
      </body>
    </html>
  );
}
