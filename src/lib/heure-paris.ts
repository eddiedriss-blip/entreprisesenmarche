// Conversion entre l'heure saisie dans un champ datetime-local (heure de Paris)
// et un instant ISO, quel que soit le fuseau du serveur.

const formateur = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Paris",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function composantesParis(ts: number) {
  const p = Object.fromEntries(formateur.formatToParts(ts).map((x) => [x.type, x.value]));
  return { a: +p.year, m: +p.month, j: +p.day, h: +p.hour, mi: +p.minute };
}

const decalage = (ts: number) => {
  const c = composantesParis(ts);
  return Date.UTC(c.a, c.m - 1, c.j, c.h, c.mi) - Math.floor(ts / 60000) * 60000;
};

/** « 2026-11-03T09:00 » (heure de Paris) → « 2026-11-03T08:00:00.000Z ». null si invalide. */
export function parisVersIso(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const naif = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let ts = naif - decalage(naif);
  ts = naif - decalage(ts); // second passage pour les changements d'heure
  return Number.isNaN(ts) ? null : new Date(ts).toISOString();
}

/** Instant ISO → « 2026-11-03T09:00 » en heure de Paris (valeur de champ datetime-local). */
export function isoVersParis(iso: string | null): string {
  if (!iso) return "";
  const c = composantesParis(new Date(iso).getTime());
  const d = (n: number) => String(n).padStart(2, "0");
  return `${c.a}-${d(c.m)}-${d(c.j)}T${d(c.h)}:${d(c.mi)}`;
}
