// Simule l'arrivée d'un mail « demande d'intervention » avec un bon PDF FICTIF,
// exactement comme le fera le service de réception des mails.
//
// Usage : npm run mail -- <cas>
//   nouveaux  3 demandes : 2 pour la plomberie, 1 pour l'électricité
//   relance   renvoie la 1re demande (même n°) → rattachée, pas de doublon
//   doublon   renvoie exactement le même mail → ignoré (déjà traité)
//   pirate    expéditeur hors AIH → ignoré
//   inconnu   destinataire principal inconnu → ignoré
//   sans-bon  pas de PDF en pièce jointe → ignoré
//   faux-pdf  « bon.pdf » qui n'est pas un PDF → ignoré
import { BONS_EXEMPLES, genererBonFictif } from "./lib/bon-fictif";
import { appUrl, PRESTATAIRES_TEST, requis } from "./lib/config";

const [PLOMBERIE, ELEC] = PRESTATAIRES_TEST.map((p) => p.adresse);

async function envoyer(libelle: string, mail: Record<string, unknown>) {
  const reponse = await fetch(`${appUrl()}/api/mails/entrants`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${requis("INBOUND_SECRET")}` },
    body: JSON.stringify(mail),
  });
  console.log(`${libelle} → HTTP ${reponse.status}`, await reponse.json());
}

async function demande(i: number, a: string, surcharge: Record<string, unknown> = {}) {
  const bon = BONS_EXEMPLES[i];
  const pdf = await genererBonFictif(bon);
  return {
    messageId: `<test-${bon.numero}-${Date.now()}-${Math.random().toString(36).slice(2)}@aih.test>`,
    de: "Agent Test AIH <agent@aih.test>",
    a: [a],
    cc: ["affaires@suivi.test"],
    objet: `Demande d'intervention ${bon.numero}`,
    expediteurAuthentifie: true,
    piecesJointes: [{ nom: `bon-${bon.numero}.pdf`, type: "application/pdf", contenuBase64: Buffer.from(pdf).toString("base64") }],
    ...surcharge,
  };
}

async function main() {
  const cas = process.argv[2];
  switch (cas) {
    case "nouveaux":
      await envoyer("Demande 1 (plomberie)", await demande(0, PLOMBERIE));
      await envoyer("Demande 2 (électricité)", await demande(1, ELEC));
      await envoyer("Demande 3 (plomberie)", await demande(2, PLOMBERIE));
      break;
    case "relance":
      await envoyer("Relance de la demande 1", await demande(0, PLOMBERIE));
      break;
    case "doublon": {
      const m = await demande(2, PLOMBERIE, { messageId: "<doublon-fixe@aih.test>" });
      await envoyer("Envoi 1", m);
      await envoyer("Envoi 2 (identique)", m);
      break;
    }
    case "pirate":
      await envoyer("Expéditeur hors AIH", await demande(0, PLOMBERIE, { de: "inconnu@exemple.test" }));
      break;
    case "inconnu":
      await envoyer("Destinataire inconnu", await demande(0, "personne@nulle-part.test"));
      break;
    case "sans-bon":
      await envoyer("Sans pièce jointe", await demande(0, PLOMBERIE, { piecesJointes: [] }));
      break;
    case "faux-pdf":
      await envoyer(
        "Faux PDF",
        await demande(0, PLOMBERIE, {
          piecesJointes: [{ nom: "bon.pdf", type: "application/pdf", contenuBase64: Buffer.from("<html>pas un pdf</html>").toString("base64") }],
        }),
      );
      break;
    default:
      console.error("Cas inconnu. Voir l'en-tête de scripts/simuler-mail.ts : nouveaux, relance, doublon, pirate, inconnu, sans-bon, faux-pdf");
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
