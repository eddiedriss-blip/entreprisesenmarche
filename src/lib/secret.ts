import { createHash, timingSafeEqual } from "node:crypto";

/** Compare l'en-tête « Authorization: Bearer … » au secret attendu, en temps constant. */
export function jetonValide(enTete: string | null, secret: string): boolean {
  const recu = enTete?.startsWith("Bearer ") ? enTete.slice(7) : "";
  const a = createHash("sha256").update(recu).digest();
  const b = createHash("sha256").update(secret).digest();
  return recu.length > 0 && timingSafeEqual(a, b);
}
