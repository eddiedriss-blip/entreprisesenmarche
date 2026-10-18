import { describe, expect, it } from "vitest";
import { genererBonFictif } from "../../../scripts/lib/bon-fictif";
import { analyserTexteBon, lireBon } from "./lecture";

describe("lecture du bon (format provisoire)", () => {
  it("lit les champs d'un vrai PDF fictif", async () => {
    const pdf = await genererBonFictif({
      numero: "INT-2026-000101",
      locataire: "MARTIN Camille",
      adresse: "12 rue des Tilleuls, 38000 Testville",
      secteur: "Testville Nord",
      travaux: "Fuite sous évier",
    });
    expect(await lireBon(pdf)).toEqual({
      numero: "INT-2026-000101",
      locataireNom: "MARTIN Camille",
      adresse: "12 rue des Tilleuls, 38000 Testville",
      secteur: "Testville Nord",
    });
  });

  it("tolère les retours à la ligne et l'apostrophe typographique", () => {
    expect(
      analyserTexteBon("N° d’intervention :\nA-1\nLocataire : DURAND\n Paul\nAdresse : 1 rue X\nSecteur : Centre"),
    ).toEqual({ numero: "A-1", locataireNom: "DURAND Paul", adresse: "1 rue X", secteur: "Centre" });
  });

  it("renvoie null si un champ obligatoire manque ou si le numéro est invalide", () => {
    expect(analyserTexteBon("Locataire : X Adresse : Y")).toBeNull();
    expect(analyserTexteBon("N° d'intervention : <script> Locataire : X Adresse : Y")).toBeNull();
    expect(analyserTexteBon("N° d'intervention : A1 Adresse : Y")).toBeNull();
  });

  it("le secteur est facultatif", () => {
    expect(analyserTexteBon("N° d'intervention : A1 Locataire : X Adresse : Y")?.secteur).toBeNull();
  });

  it("renvoie null pour un fichier qui n'est pas un PDF lisible", async () => {
    expect(await lireBon(new TextEncoder().encode("%PDF-1.4 cassé"))).toBeNull();
  });
});
