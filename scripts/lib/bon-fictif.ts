// Génère un bon d'intervention FICTIF au format PDF, pour les tests.
// Ce format est provisoire (voir src/lib/bon/lecture.ts).
import { PDFDocument, StandardFonts } from "pdf-lib";

export type DonneesBon = {
  numero: string;
  locataire: string;
  adresse: string;
  secteur: string;
  travaux: string;
};

export async function genererBonFictif(d: DonneesBon): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const police = await doc.embedFont(StandardFonts.Helvetica);
  const gras = await doc.embedFont(StandardFonts.HelveticaBold);

  page.drawText("BON D'INTERVENTION - DOCUMENT FICTIF DE TEST", { x: 50, y: 780, size: 14, font: gras });
  const lignes: [string, string][] = [
    ["N° d'intervention :", d.numero],
    ["Locataire :", d.locataire],
    ["Adresse :", d.adresse],
    ["Secteur :", d.secteur],
    ["Nature des travaux :", d.travaux],
  ];
  lignes.forEach(([libelle, valeur], i) => {
    const y = 730 - i * 26;
    page.drawText(libelle, { x: 50, y, size: 11, font: gras });
    page.drawText(valeur, { x: 190, y, size: 11, font: police });
  });
  return doc.save();
}

export const BONS_EXEMPLES: DonneesBon[] = [
  { numero: "INT-2026-000101", locataire: "MARTIN Camille", adresse: "12 rue des Tilleuls, 38000 Testville", secteur: "Testville Nord", travaux: "Fuite sous évier" },
  { numero: "INT-2026-000102", locataire: "BERNARD Léo", adresse: "4 allée des Érables, 38100 Testville", secteur: "Testville Sud", travaux: "Prise électrique hors service" },
  { numero: "INT-2026-000103", locataire: "PETIT Inès", adresse: "27 avenue du Lac, 38400 Exempleville", secteur: "Exempleville", travaux: "Chasse d'eau défectueuse" },
];
