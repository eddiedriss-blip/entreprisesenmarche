"use server";

import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { z } from "zod";
import { MIMES_RAPPORT, nettoyerNomFichier, TAILLE_MAX, verifierFichier } from "@/lib/fichiers";
import { parisVersIso } from "@/lib/heure-paris";
import { MOTIFS, STATUTS } from "@/lib/libelles";
import { exigerProfil } from "@/lib/session";
import { BUCKET, clientServeur, clientUtilisateur } from "@/lib/supabase/serveur";
import { estUuid } from "@/lib/uuid";

export type EtatAction = { ok: boolean; message: string } | null;

const MESSAGES: Record<string, string> = {
  acces_refuse: "Vous n'avez pas accès à cette affaire.",
  date_rdv_requise: "Indiquez la date du rendez-vous.",
  motif_requis: "Indiquez le motif de l'attente.",
  precision_requise: "Précisez le motif « Autre ».",
  precision_trop_longue: "La précision est trop longue (300 caractères max).",
  note_invalide: "La note doit faire entre 1 et 2000 caractères.",
};

function traduire(erreur: { message: string } | null): EtatAction {
  if (!erreur) return null;
  const cle = Object.keys(MESSAGES).find((k) => erreur.message.includes(k));
  return { ok: false, message: cle ? MESSAGES[cle] : "Une erreur est survenue. Réessayez." };
}

/**
 * Vérifie que l'utilisateur est le prestataire de l'affaire. La lecture passe
 * par la RLS : une affaire d'un autre prestataire est simplement introuvable.
 */
async function exigerMonAffaire(affaireId: string) {
  const profil = await exigerProfil();
  if (profil.role !== "prestataire" || !estUuid(affaireId)) return null;
  const sb = await clientUtilisateur();
  const { data } = await sb
    .from("affaires")
    .select("id")
    .eq("id", affaireId)
    .eq("prestataire_id", profil.prestataire_id!)
    .maybeSingle();
  return data ? { profil, sb } : null;
}

const schemaStatut = z.object({
  statut: z.enum(STATUTS),
  rdv_le: z.string().optional(),
  motif: z.enum(MOTIFS).optional().or(z.literal("")),
  precision: z.string().max(300).optional(),
});

export async function changerStatut(affaireId: string, _e: EtatAction, formData: FormData): Promise<EtatAction> {
  const acces = await exigerMonAffaire(affaireId);
  if (!acces) return { ok: false, message: MESSAGES.acces_refuse };

  const saisie = schemaStatut.safeParse(Object.fromEntries(formData));
  if (!saisie.success) return { ok: false, message: "Saisie invalide." };
  const { statut, rdv_le, motif, precision } = saisie.data;

  const rdvIso = statut === "rdv_pris" ? parisVersIso(rdv_le ?? "") : null;
  if (statut === "rdv_pris" && !rdvIso) return { ok: false, message: MESSAGES.date_rdv_requise };

  const { error } = await acces.sb.rpc("changer_statut", {
    p_affaire: affaireId,
    p_statut: statut,
    p_rdv_le: rdvIso,
    p_motif: statut === "en_attente" ? motif || null : null,
    p_precision: statut === "en_attente" ? precision || null : null,
  });
  if (error) return traduire(error);
  refresh();
  return { ok: true, message: "Statut enregistré." };
}

export async function ajouterNote(affaireId: string, _e: EtatAction, formData: FormData): Promise<EtatAction> {
  const acces = await exigerMonAffaire(affaireId);
  if (!acces) return { ok: false, message: MESSAGES.acces_refuse };
  const texte = String(formData.get("texte") ?? "");
  const { error } = await acces.sb.rpc("ajouter_note", { p_affaire: affaireId, p_texte: texte });
  if (error) return traduire(error);
  refresh();
  return { ok: true, message: "Note ajoutée." };
}

// ─── Dépôt de rapport en deux temps ───
// Le fichier part directement du navigateur vers le stockage privé, via un
// lien de dépôt signé à usage unique. Le serveur le contrôle ensuite (vrai
// type, taille) avant de l'enregistrer ; sinon il est supprimé.

const EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function preparerDepot(
  affaireId: string,
  fichier: { taille: number; type: string },
): Promise<{ ok: true; chemin: string; jeton: string } | { ok: false; message: string }> {
  const acces = await exigerMonAffaire(affaireId);
  if (!acces) return { ok: false, message: MESSAGES.acces_refuse };
  if (!(fichier.taille > 0 && fichier.taille <= TAILLE_MAX)) return { ok: false, message: "Fichier trop volumineux (10 Mo max)." };
  const extension = EXTENSIONS[fichier.type];
  if (!extension) return { ok: false, message: "Formats acceptés : PDF, JPEG, PNG, WebP." };

  const chemin = `affaires/${affaireId}/rapport/${randomUUID()}.${extension}`;
  const { data, error } = await clientServeur().storage.from(BUCKET).createSignedUploadUrl(chemin);
  if (error || !data) return { ok: false, message: "Dépôt indisponible, réessayez." };
  return { ok: true, chemin, jeton: data.token };
}

export async function finaliserDepot(affaireId: string, chemin: string, nomFichier: string): Promise<EtatAction> {
  const acces = await exigerMonAffaire(affaireId);
  if (!acces) return { ok: false, message: MESSAGES.acces_refuse };
  const attendu = new RegExp(`^affaires/${affaireId}/rapport/[0-9a-f-]{36}\\.(pdf|jpg|png|webp)$`);
  const correspondance = attendu.exec(chemin);
  if (!correspondance) return { ok: false, message: "Dépôt invalide." };

  const admin = clientServeur();
  const stockage = admin.storage.from(BUCKET);
  const { data: blob, error } = await stockage.download(chemin);
  if (error || !blob) return { ok: false, message: "Fichier introuvable, recommencez le dépôt." };

  const octets = new Uint8Array(await blob.arrayBuffer());
  const verif = verifierFichier(octets, MIMES_RAPPORT);
  if (!verif.ok || verif.type.extension !== correspondance[1]) {
    await stockage.remove([chemin]);
    return {
      ok: false,
      message: verif.ok || verif.motif === "type_refuse"
        ? "Ce fichier n'est pas un PDF ou une image valide."
        : verif.motif === "trop_gros"
          ? "Fichier trop volumineux (10 Mo max)."
          : "Fichier vide.",
    };
  }

  const { data, error: errEnreg } = await admin.rpc("enregistrer_document", {
    p_affaire: affaireId,
    p_type: "rapport",
    p_chemin: chemin,
    p_nom: nettoyerNomFichier(nomFichier),
    p_mime: verif.type.mime,
    p_taille: verif.taille,
    p_sha256: verif.sha256,
    p_acteur: acces.profil.id,
  });
  if (errEnreg) {
    await stockage.remove([chemin]);
    return traduire(errEnreg);
  }
  if ((data as { resultat: string }).resultat === "doublon") {
    await stockage.remove([chemin]);
    return { ok: true, message: "Ce fichier avait déjà été déposé." };
  }
  refresh();
  return { ok: true, message: "Rapport déposé." };
}
