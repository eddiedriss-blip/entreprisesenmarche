import { createBrowserClient } from "@supabase/ssr";

// Utilisé uniquement pour envoyer un fichier vers un lien de dépôt signé
// fourni par le serveur. Aucune lecture de données depuis le navigateur.
export function clientNavigateur() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
