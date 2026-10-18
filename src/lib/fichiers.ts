import { createHash } from "node:crypto";

export const TAILLE_MAX = 10 * 1024 * 1024; // 10 Mo

export type TypeFichier = { mime: string; extension: string };

const TYPES = {
  pdf: { mime: "application/pdf", extension: "pdf" },
  jpeg: { mime: "image/jpeg", extension: "jpg" },
  png: { mime: "image/png", extension: "png" },
  webp: { mime: "image/webp", extension: "webp" },
} satisfies Record<string, TypeFichier>;

export const MIMES_RAPPORT = Object.values(TYPES).map((t) => t.mime);

function commencePar(octets: Uint8Array, signature: number[], decalage = 0) {
  return signature.every((o, i) => octets[decalage + i] === o);
}

/**
 * Identifie le type réel d'un fichier d'après ses premiers octets, sans faire
 * confiance au nom ni au type annoncé. Renvoie null si le type n'est pas accepté.
 */
export function detecterType(octets: Uint8Array): TypeFichier | null {
  if (commencePar(octets, [0x25, 0x50, 0x44, 0x46, 0x2d])) return TYPES.pdf; // %PDF-
  if (commencePar(octets, [0xff, 0xd8, 0xff])) return TYPES.jpeg;
  if (commencePar(octets, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return TYPES.png;
  if (commencePar(octets, [0x52, 0x49, 0x46, 0x46]) && commencePar(octets, [0x57, 0x45, 0x42, 0x50], 8)) {
    return TYPES.webp; // RIFF....WEBP
  }
  return null;
}

export type Verification =
  | { ok: true; type: TypeFichier; taille: number; sha256: string }
  | { ok: false; motif: "vide" | "trop_gros" | "type_refuse" };

export function verifierFichier(octets: Uint8Array, typesAcceptes: string[]): Verification {
  if (octets.byteLength === 0) return { ok: false, motif: "vide" };
  if (octets.byteLength > TAILLE_MAX) return { ok: false, motif: "trop_gros" };
  const type = detecterType(octets);
  if (!type || !typesAcceptes.includes(type.mime)) return { ok: false, motif: "type_refuse" };
  return {
    ok: true,
    type,
    taille: octets.byteLength,
    sha256: createHash("sha256").update(octets).digest("hex"),
  };
}

/** Nom de fichier affichable : sans chemin ni caractères de contrôle. */
export function nettoyerNomFichier(nom: string): string {
  const base = nom.split(/[\\/]/).pop() ?? "";
  const propre = base.replace(/[\u0000-\u001f\u007f"<>]/g, "").trim().slice(0, 200);
  return propre || "fichier";
}
