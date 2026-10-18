import "server-only";

function lire(nom: string): string {
  const valeur = process.env[nom];
  if (!valeur) throw new Error(`Variable d'environnement manquante : ${nom}`);
  return valeur;
}

function lireSecret(nom: string): string {
  const valeur = lire(nom);
  if (valeur.length < 32) throw new Error(`${nom} doit faire au moins 32 caractères`);
  return valeur;
}

export const env = {
  get supabaseUrl() {
    return lire("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseCleePublique() {
    return lire("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  },
  get supabaseCleeSecrete() {
    return lire("SUPABASE_SECRET_KEY");
  },
  get appUrl() {
    return lire("APP_URL").replace(/\/$/, "");
  },
  get inboundSecret() {
    return lireSecret("INBOUND_SECRET");
  },
  get cronSecret() {
    return lireSecret("CRON_SECRET");
  },
  get domainesAutorises() {
    return lire("DOMAINES_EXPEDITEURS_AUTORISES")
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);
  },
};
