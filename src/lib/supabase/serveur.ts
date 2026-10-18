import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

/**
 * Client au nom de l'utilisateur connecté : toutes les requêtes passent par
 * les règles d'accès (RLS) de la base. À utiliser par défaut.
 */
export async function clientUtilisateur() {
  const magasin = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseCleePublique, {
    cookies: {
      getAll: () => magasin.getAll(),
      setAll: (aEcrire) => {
        try {
          for (const { name, value, options } of aEcrire) magasin.set(name, value, options);
        } catch {
          // Appelé depuis un composant serveur : le proxy rafraîchit la session.
        }
      },
    },
  });
}

/**
 * Client serveur avec la clé secrète : contourne la RLS. Réservé à la réception
 * des mails, au stockage (liens signés), à la purge et à l'administration,
 * TOUJOURS après une vérification de droits faite avec clientUtilisateur().
 */
export function clientServeur() {
  return createClient(env.supabaseUrl, env.supabaseCleeSecrete, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const BUCKET = "documents";
