import { beforeEach, describe, expect, it } from "vitest";
import type { InfosBon } from "@/lib/bon/lecture";
import { extraireAdresse, schemaMailEntrant, type MailEntrant } from "./schema";
import { traiterMailEntrant, type Dependances } from "./traitement";

const PDF = Buffer.from("%PDF-1.4 bon fictif").toString("base64");
const INFOS: InfosBon = { numero: "INT-1", locataireNom: "NOM FICTIF", adresse: "1 rue Test", secteur: "Nord" };

function mail(surcharge: Partial<MailEntrant> = {}): MailEntrant {
  return schemaMailEntrant.parse({
    messageId: "<abc@aih.test>",
    de: "Agent AIH <agent@aih.test>",
    a: ["Plomberie <Contact@Plombier.test>"],
    cc: ["affaires@suivi.test"],
    objet: "Demande d'intervention",
    expediteurAuthentifie: true,
    piecesJointes: [{ nom: "bon.pdf", type: "application/pdf", contenuBase64: PDF }],
    ...surcharge,
  });
}

/** Fausse base en mémoire. */
function fausseBase() {
  const etat = {
    affaires: new Map<string, string>(), // numero → id
    mails: new Set<string>(),
    fichiers: new Map<string, number>(), // chemin → taille
    shas: new Set<string>(),
    rejets: [] as string[],
  };
  const deps: Dependances = {
    lireBon: async () => INFOS,
    trouverPrestataire: async (email) => (email === "contact@plombier.test" ? "presta-1" : null),
    creerOuRattacher: async ({ infos, messageId }) => {
      const existante = etat.affaires.get(infos.numero);
      if (etat.mails.has(messageId)) return { affaireId: existante!, resultat: "mail_deja_traite" };
      etat.mails.add(messageId);
      if (existante) return { affaireId: existante, resultat: "rattachee" };
      const id = `aff-${etat.affaires.size + 1}`;
      etat.affaires.set(infos.numero, id);
      return { affaireId: id, resultat: "creee" };
    },
    stocker: async (chemin, octets) => void etat.fichiers.set(chemin, octets.byteLength),
    supprimerFichier: async (chemin) => void etat.fichiers.delete(chemin),
    enregistrerBon: async ({ affaireId, sha256 }) => {
      const cle = `${affaireId}:${sha256}`;
      if (etat.shas.has(cle)) return "doublon";
      etat.shas.add(cle);
      return "enregistre";
    },
    rejeter: async (motif) => void etat.rejets.push(motif),
  };
  return { etat, deps };
}

let base: ReturnType<typeof fausseBase>;
beforeEach(() => {
  base = fausseBase();
});
const traiter = (m: MailEntrant) => traiterMailEntrant(m, base.deps, ["aih.test"]);

describe("réception d'un mail", () => {
  it("crée l'affaire, l'attribue au destinataire principal et stocke le bon", async () => {
    const r = await traiter(mail());
    expect(r).toEqual({ statut: "creee", affaireId: "aff-1", bon: "enregistre" });
    expect([...base.etat.fichiers.keys()][0]).toMatch(/^affaires\/aff-1\/bon\/[0-9a-f-]{36}\.pdf$/);
  });

  it("rattache un nouveau mail au même n° d'intervention, sans doublon de bon", async () => {
    await traiter(mail());
    const r = await traiter(mail({ messageId: "<relance@aih.test>" }));
    expect(r).toEqual({ statut: "rattachee", affaireId: "aff-1", bon: "doublon" });
    expect(base.etat.affaires.size).toBe(1);
    expect(base.etat.fichiers.size).toBe(1); // le fichier en double a été supprimé
  });

  it("ignore un mail d'un domaine non autorisé", async () => {
    expect(await traiter(mail({ de: "pirate@exemple.test" }))).toEqual({ statut: "rejete", motif: "expediteur_non_autorise" });
    expect(base.etat.rejets).toEqual(["expediteur_non_autorise"]);
  });

  it("ignore un mail dont l'expéditeur n'est pas authentifié (SPF/DKIM)", async () => {
    expect((await traiter(mail({ expediteurAuthentifie: false }))).statut).toBe("rejete");
  });

  it("ignore un mail dont le destinataire principal n'est pas un prestataire connu", async () => {
    // Le prestataire en copie ne suffit pas : seul le premier « À » compte.
    const r = await traiter(mail({ a: ["collegue@aih.test", "contact@plombier.test"] }));
    expect(r).toEqual({ statut: "rejete", motif: "destinataire_inconnu" });
  });

  it("ignore un mail sans bon PDF valide (image, faux PDF…)", async () => {
    const image = { nom: "logo.png", type: "image/png", contenuBase64: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString("base64") };
    const fauxPdf = { nom: "bon.pdf", type: "application/pdf", contenuBase64: Buffer.from("<html>").toString("base64") };
    expect(await traiter(mail({ piecesJointes: [image, fauxPdf] }))).toEqual({ statut: "rejete", motif: "aucun_bon_pdf" });
    expect(await traiter(mail({ piecesJointes: [] }))).toEqual({ statut: "rejete", motif: "aucun_bon_pdf" });
  });

  it("ignore un bon illisible", async () => {
    base.deps.lireBon = async () => null;
    expect(await traiter(mail())).toEqual({ statut: "rejete", motif: "bon_illisible" });
    expect(base.etat.affaires.size).toBe(0);
  });

  it("retraiter le même mail ne crée rien de plus", async () => {
    await traiter(mail());
    const r = await traiter(mail());
    expect(r.statut).toBe("mail_deja_traite");
    expect(base.etat.fichiers.size).toBe(1);
  });

  it("si l'enregistrement du bon échoue, le fichier stocké est supprimé", async () => {
    base.deps.enregistrerBon = async () => {
      throw new Error("panne");
    };
    await expect(traiter(mail())).rejects.toThrow("panne");
    expect(base.etat.fichiers.size).toBe(0);
  });
});

describe("adresses", () => {
  it("extrait et normalise l'adresse", () => {
    expect(extraireAdresse("Jean Dupont <Jean.Dupont@Exemple.FR>")).toBe("jean.dupont@exemple.fr");
    expect(extraireAdresse("contact@plombier.test")).toBe("contact@plombier.test");
    expect(extraireAdresse("pas une adresse")).toBeNull();
  });
});
