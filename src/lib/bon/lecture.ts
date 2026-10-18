// ╔══════════════════════════════════════════════════════════════════════╗
// ║ PROVISOIRE — lecture du bon d'intervention.                          ║
// ║ Le format ci-dessous est celui des bons FICTIFS générés par          ║
// ║ scripts/lib/bon-fictif.ts. Il sera remplacé par le format du vrai    ║
// ║ bon dès qu'un exemple anonymisé sera disponible : seule la fonction  ║
// ║ analyserTexteBon() et ses tests seront à adapter.                    ║
// ╚══════════════════════════════════════════════════════════════════════╝

import { extractText, getDocumentProxy } from "unpdf";

export type InfosBon = {
  numero: string;
  locataireNom: string;
  adresse: string;
  secteur: string | null;
};

// Libellés repérés dans le texte du bon, dans n'importe quel ordre.
const LIBELLES = {
  numero: /N°\s*d'intervention\s*:/i,
  locataireNom: /Locataire\s*:/i,
  adresse: /Adresse\s*:/i,
  secteur: /Secteur\s*:/i,
  // Libellés non conservés : ils marquent seulement la fin du champ précédent.
  _travaux: /Nature des travaux\s*:/i,
  _telephone: /T[ée]l[ée]phone\s*:/i,
} as const;

const FORMAT_NUMERO = /^[A-Za-z0-9/_-]{1,40}$/;

function normaliser(texte: string) {
  return texte.normalize("NFC").replace(/[’`´]/g, "'").replace(/\s+/g, " ").trim();
}

/**
 * Extrait les champs du texte d'un bon. Chaque valeur va de la fin de son
 * libellé jusqu'au libellé suivant. Seuls les champs utiles sont gardés.
 */
export function analyserTexteBon(texteBrut: string): InfosBon | null {
  const texte = normaliser(texteBrut);
  const reperes = Object.entries(LIBELLES)
    .map(([champ, motif]) => {
      const m = motif.exec(texte);
      return m ? { champ, debut: m.index, fin: m.index + m[0].length } : null;
    })
    .filter((r) => r !== null)
    .sort((x, y) => x.debut - y.debut);

  const valeurs: Record<string, string> = {};
  reperes.forEach((r, i) => {
    const suivant = reperes[i + 1]?.debut ?? texte.length;
    valeurs[r.champ] = texte.slice(r.fin, suivant).trim();
  });

  // Le numéro est le premier « mot » après son libellé.
  const numero = (valeurs.numero ?? "").split(" ")[0];
  const locataireNom = (valeurs.locataireNom ?? "").slice(0, 200);
  const adresse = (valeurs.adresse ?? "").slice(0, 300);
  const secteur = (valeurs.secteur ?? "").slice(0, 80) || null;

  if (!FORMAT_NUMERO.test(numero) || !locataireNom || !adresse) return null;
  return { numero, locataireNom, adresse, secteur };
}

export async function lireBon(pdf: Uint8Array): Promise<InfosBon | null> {
  try {
    const doc = await getDocumentProxy(new Uint8Array(pdf));
    const { text } = await extractText(doc, { mergePages: true });
    return analyserTexteBon(text);
  } catch {
    return null; // PDF corrompu ou protégé
  }
}
