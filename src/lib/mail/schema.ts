import { z } from "zod";

// Format interne d'un mail reçu. Le service de réception (Brevo, Mailgun…)
// sera branché via un petit adaptateur qui produit ce format ; en test, le
// script scripts/simuler-mail.ts l'envoie directement.
export const schemaMailEntrant = z.object({
  messageId: z.string().trim().min(3).max(300),
  de: z.string().trim().min(3).max(320),
  a: z.array(z.string().trim().max(320)).min(1).max(50),
  cc: z.array(z.string().trim().max(320)).max(50).default([]),
  objet: z.string().max(1000).default(""),
  // Résultat des contrôles SPF/DKIM fournis par le service de réception.
  expediteurAuthentifie: z.boolean(),
  piecesJointes: z
    .array(
      z.object({
        nom: z.string().max(300),
        type: z.string().max(200),
        // 10 Mo en base64 ≈ 13,4 millions de caractères ; marge pour les retours à la ligne.
        contenuBase64: z.string().max(14_500_000),
      }),
    )
    .max(20)
    .default([]),
});

export type MailEntrant = z.infer<typeof schemaMailEntrant>;

/** « Jean Dupont <Jean@Exemple.fr> » → « jean@exemple.fr » (ou null si invalide). */
export function extraireAdresse(brut: string): string | null {
  const entreChevrons = /<([^<>]+)>/.exec(brut);
  const adresse = (entreChevrons ? entreChevrons[1] : brut).trim().toLowerCase();
  return /^[^@\s<>"]+@[^@\s<>"]+\.[^@\s<>"]+$/.test(adresse) ? adresse : null;
}

export const domaineDe = (adresse: string) => adresse.split("@")[1] ?? "";
