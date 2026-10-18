import { createClient } from "@supabase/supabase-js";

export function requis(nom: string): string {
  const v = process.env[nom];
  if (!v) {
    console.error(`Variable manquante : ${nom} (voir .env.example, à copier en .env.local)`);
    process.exit(1);
  }
  return v;
}

export const clientServeur = () =>
  createClient(requis("NEXT_PUBLIC_SUPABASE_URL"), requis("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export const appUrl = () => requis("APP_URL").replace(/\/$/, "");

// Données FICTIVES du jeu de test.
export const PRESTATAIRES_TEST = [
  { nom: "Plomberie Fictive", adresse: "contact@plomberie-fictive.test", compte: "plombier@plomberie-fictive.test" },
  { nom: "Électricité Fictive", adresse: "contact@elec-fictive.test", compte: "electricien@elec-fictive.test" },
];
export const COMPTES_AIH_TEST = [
  { email: "admin@aih.test", role: "admin" as const },
  { email: "lecture@aih.test", role: "aih_lecture" as const },
];
