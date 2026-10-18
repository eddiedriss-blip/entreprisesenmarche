"use server";

import { z } from "zod";
import { env } from "@/lib/env";
import { clientUtilisateur } from "@/lib/supabase/serveur";

export type EtatConnexion = { message: string; erreur?: boolean } | null;

export async function envoyerLien(_etat: EtatConnexion, formData: FormData): Promise<EtatConnexion> {
  const email = z.email().safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
  if (!email.success) return { message: "Adresse mail invalide.", erreur: true };

  const sb = await clientUtilisateur();
  // shouldCreateUser: false → seuls les comptes créés par un admin reçoivent un lien.
  await sb.auth.signInWithOtp({
    email: email.data,
    options: { shouldCreateUser: false, emailRedirectTo: `${env.appUrl}/auth/confirm` },
  });

  // Même réponse que le compte existe ou non : on ne révèle pas qui a un compte.
  return {
    message: "Si cette adresse correspond à un compte, un lien de connexion vient d'être envoyé. Il est valable 1 heure.",
  };
}
