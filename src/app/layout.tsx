import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";
import { LIBELLE_ROLE } from "@/lib/libelles";
import { profilCourant } from "@/lib/session";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Suivi des interventions",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const profil = await profilCourant();
  return (
    <html lang="fr" className={`${geistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        {profil && (
          <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
              <Link href="/affaires" className="font-semibold">
                Suivi des interventions
              </Link>
              <nav className="flex gap-4 text-sm">
                <Link href="/affaires" className="hover:underline">
                  Affaires
                </Link>
                {profil.role === "admin" && (
                  <Link href="/admin" className="hover:underline">
                    Administration
                  </Link>
                )}
              </nav>
              <div className="ml-auto flex items-center gap-3 text-sm text-slate-600">
                <span>
                  {profil.email} · {LIBELLE_ROLE[profil.role]}
                </span>
                <form action="/deconnexion" method="post">
                  <button className="bouton-secondaire">Se déconnecter</button>
                </form>
              </div>
            </div>
          </header>
        )}
        <div className="flex-1">{children}</div>
      </body>
    </html>
  );
}
