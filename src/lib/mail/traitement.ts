import { createHash, randomUUID } from "node:crypto";
import type { InfosBon } from "@/lib/bon/lecture";
import { nettoyerNomFichier, verifierFichier } from "@/lib/fichiers";
import { domaineDe, extraireAdresse, type MailEntrant } from "@/lib/mail/schema";

export type MotifRejet =
  | "expediteur_non_autorise"
  | "destinataire_inconnu"
  | "aucun_bon_pdf"
  | "bon_illisible"
  | "format_invalide";

export type ResultatTraitement =
  | { statut: "creee" | "rattachee" | "mail_deja_traite"; affaireId: string; bon: "enregistre" | "doublon" }
  | { statut: "rejete"; motif: MotifRejet };

/** Accès aux données, injectés pour pouvoir tester la logique sans base. */
export type Dependances = {
  lireBon(pdf: Uint8Array): Promise<InfosBon | null>;
  trouverPrestataire(email: string): Promise<string | null>;
  creerOuRattacher(p: {
    infos: InfosBon;
    prestataireId: string;
    messageId: string;
    expediteur: string;
    destinataire: string;
  }): Promise<{ affaireId: string; resultat: "creee" | "rattachee" | "mail_deja_traite" }>;
  stocker(chemin: string, octets: Uint8Array, mime: string): Promise<void>;
  supprimerFichier(chemin: string): Promise<void>;
  enregistrerBon(p: {
    affaireId: string;
    chemin: string;
    nom: string;
    taille: number;
    sha256: string;
  }): Promise<"enregistre" | "doublon">;
  rejeter(motif: MotifRejet, domaine: string | null, empreinteMessageId: string): Promise<void>;
};

export const empreinte = (texte: string) => createHash("sha256").update(texte).digest("hex").slice(0, 32);

export async function traiterMailEntrant(
  mail: MailEntrant,
  deps: Dependances,
  domainesAutorises: string[],
): Promise<ResultatTraitement> {
  const expediteur = extraireAdresse(mail.de);
  const domaine = expediteur ? domaineDe(expediteur) : null;
  const rejeter = async (motif: MotifRejet): Promise<ResultatTraitement> => {
    await deps.rejeter(motif, domaine, empreinte(mail.messageId));
    return { statut: "rejete", motif };
  };

  // 1. Expéditeur : uniquement AIH, et authentifié (SPF/DKIM).
  if (!expediteur || !domaine || !mail.expediteurAuthentifie || !domainesAutorises.includes(domaine)) {
    return rejeter("expediteur_non_autorise");
  }

  // 2. Prestataire : déterminé par le destinataire principal (premier « À »).
  const destinataire = extraireAdresse(mail.a[0]);
  const prestataireId = destinataire ? await deps.trouverPrestataire(destinataire) : null;
  if (!destinataire || !prestataireId) return rejeter("destinataire_inconnu");

  // 3. Pièces jointes : seuls les vrais PDF de 10 Mo max sont retenus
  //    (les logos de signature, etc. sont simplement ignorés).
  const pdfs = mail.piecesJointes
    .map((pj) => {
      const octets = new Uint8Array(Buffer.from(pj.contenuBase64, "base64"));
      return { nom: nettoyerNomFichier(pj.nom), octets, verif: verifierFichier(octets, ["application/pdf"]) };
    })
    .filter((pj) => pj.verif.ok);
  if (pdfs.length === 0) return rejeter("aucun_bon_pdf");

  // 4. Lecture du bon : le premier PDF lisible fait foi.
  let bon: { nom: string; octets: Uint8Array; taille: number; sha256: string; infos: InfosBon } | null = null;
  for (const pdf of pdfs) {
    const infos = await deps.lireBon(pdf.octets);
    if (infos && pdf.verif.ok) {
      bon = { nom: pdf.nom, octets: pdf.octets, taille: pdf.verif.taille, sha256: pdf.verif.sha256, infos };
      break;
    }
  }
  if (!bon) return rejeter("bon_illisible");

  // 5. Création de l'affaire, ou rattachement si le n° existe déjà.
  const { affaireId, resultat } = await deps.creerOuRattacher({
    infos: bon.infos,
    prestataireId,
    messageId: mail.messageId,
    expediteur,
    destinataire,
  });

  // 6. Bon stocké même si le mail a déjà été vu : si un premier essai a échoué
  //    après la création de l'affaire, le nouvel essai complète le travail.
  //    L'empreinte du fichier évite tout doublon.
  const chemin = `affaires/${affaireId}/bon/${randomUUID()}.pdf`;
  await deps.stocker(chemin, bon.octets, "application/pdf");
  let etatBon: "enregistre" | "doublon";
  try {
    etatBon = await deps.enregistrerBon({ affaireId, chemin, nom: bon.nom, taille: bon.taille, sha256: bon.sha256 });
  } catch (e) {
    await deps.supprimerFichier(chemin);
    throw e;
  }
  if (etatBon === "doublon") await deps.supprimerFichier(chemin);

  return { statut: resultat, affaireId, bon: etatBon };
}
