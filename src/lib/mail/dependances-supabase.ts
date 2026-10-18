import "server-only";
import { lireBon } from "@/lib/bon/lecture";
import type { Dependances } from "@/lib/mail/traitement";
import { BUCKET, clientServeur } from "@/lib/supabase/serveur";

function verifier<T>(res: { data: T; error: { message: string } | null }, contexte: string): T {
  if (res.error) throw new Error(`${contexte} : ${res.error.message}`);
  return res.data;
}

export function dependancesSupabase(): Dependances {
  const sb = clientServeur();
  return {
    lireBon,

    async trouverPrestataire(email) {
      const data = verifier(
        await sb
          .from("prestataire_adresses")
          .select("prestataire_id, prestataires!inner(actif)")
          .eq("email", email)
          .eq("prestataires.actif", true)
          .maybeSingle(),
        "recherche prestataire",
      );
      return (data as { prestataire_id: string } | null)?.prestataire_id ?? null;
    },

    async creerOuRattacher({ infos, prestataireId, messageId, expediteur, destinataire }) {
      const data = verifier(
        await sb.rpc("creer_ou_rattacher_affaire", {
          p_numero: infos.numero,
          p_nom: infos.locataireNom,
          p_adresse: infos.adresse,
          p_secteur: infos.secteur,
          p_prestataire: prestataireId,
          p_message_id: messageId,
          p_expediteur: expediteur,
          p_destinataire: destinataire,
        }),
        "création affaire",
      ) as { affaire_id: string; resultat: "creee" | "rattachee" | "mail_deja_traite" };
      return { affaireId: data.affaire_id, resultat: data.resultat };
    },

    async stocker(chemin, octets, mime) {
      verifier(await sb.storage.from(BUCKET).upload(chemin, octets, { contentType: mime, upsert: false }), "stockage");
    },

    async supprimerFichier(chemin) {
      await sb.storage.from(BUCKET).remove([chemin]);
    },

    async enregistrerBon({ affaireId, chemin, nom, taille, sha256 }) {
      const data = verifier(
        await sb.rpc("enregistrer_document", {
          p_affaire: affaireId,
          p_type: "bon",
          p_chemin: chemin,
          p_nom: nom,
          p_mime: "application/pdf",
          p_taille: taille,
          p_sha256: sha256,
          p_acteur: null,
        }),
        "enregistrement bon",
      ) as { resultat: "enregistre" | "doublon" };
      return data.resultat;
    },

    async rejeter(motif, domaine, empreinteMessageId) {
      verifier(
        await sb.rpc("rejeter_mail", { p_motif: motif, p_domaine: domaine, p_empreinte: empreinteMessageId }),
        "rejet",
      );
    },
  };
}
