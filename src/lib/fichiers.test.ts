import { describe, expect, it } from "vitest";
import { detecterType, MIMES_RAPPORT, nettoyerNomFichier, TAILLE_MAX, verifierFichier } from "./fichiers";

const octets = (...o: number[]) => new Uint8Array(o);

describe("validation des fichiers", () => {
  it("reconnaît le vrai type d'après le contenu", () => {
    expect(detecterType(new TextEncoder().encode("%PDF-1.7 ..."))?.mime).toBe("application/pdf");
    expect(detecterType(octets(0xff, 0xd8, 0xff, 0xe0))?.mime).toBe("image/jpeg");
    expect(detecterType(octets(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))?.mime).toBe("image/png");
    expect(detecterType(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))?.mime).toBe("image/webp");
  });

  it("refuse un fichier déguisé (HTML renommé en .pdf, exécutable…)", () => {
    expect(detecterType(new TextEncoder().encode("<html><script>"))).toBeNull();
    expect(detecterType(octets(0x4d, 0x5a, 0x90, 0x00))).toBeNull();
    expect(verifierFichier(new TextEncoder().encode("<html>"), MIMES_RAPPORT)).toEqual({ ok: false, motif: "type_refuse" });
  });

  it("refuse une image là où seul un PDF est attendu", () => {
    expect(verifierFichier(octets(0xff, 0xd8, 0xff, 0xe0), ["application/pdf"])).toEqual({ ok: false, motif: "type_refuse" });
  });

  it("refuse les fichiers vides ou de plus de 10 Mo", () => {
    expect(verifierFichier(new Uint8Array(0), MIMES_RAPPORT)).toEqual({ ok: false, motif: "vide" });
    const gros = new Uint8Array(TAILLE_MAX + 1);
    gros.set(new TextEncoder().encode("%PDF-"));
    expect(verifierFichier(gros, MIMES_RAPPORT)).toEqual({ ok: false, motif: "trop_gros" });
  });

  it("calcule l'empreinte d'un fichier accepté", () => {
    const r = verifierFichier(new TextEncoder().encode("%PDF-1.4"), MIMES_RAPPORT);
    expect(r.ok && r.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("nettoie les noms de fichiers", () => {
    expect(nettoyerNomFichier("../../etc/passwd")).toBe("passwd");
    expect(nettoyerNomFichier('C:\\photos\\"rapport"<1>.jpg')).toBe("rapport1.jpg");
    expect(nettoyerNomFichier("   ")).toBe("fichier");
  });
});
