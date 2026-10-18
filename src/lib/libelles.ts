export const STATUTS = [
  "nouvelle",
  "client_appele",
  "rdv_pris",
  "en_attente",
  "intervenu",
  "termine",
] as const;
export type Statut = (typeof STATUTS)[number];

export const LIBELLE_STATUT: Record<Statut, string> = {
  nouvelle: "Nouvelle",
  client_appele: "Client appelé",
  rdv_pris: "RDV pris",
  en_attente: "En attente",
  intervenu: "Intervenu",
  termine: "Terminé",
};

export const COULEUR_STATUT: Record<Statut, string> = {
  nouvelle: "bg-sky-100 text-sky-900",
  client_appele: "bg-indigo-100 text-indigo-900",
  rdv_pris: "bg-violet-100 text-violet-900",
  en_attente: "bg-amber-100 text-amber-900",
  intervenu: "bg-teal-100 text-teal-900",
  termine: "bg-slate-200 text-slate-700",
};

export const MOTIFS = ["piece", "devis", "acces", "autre"] as const;
export type Motif = (typeof MOTIFS)[number];

export const LIBELLE_MOTIF: Record<Motif, string> = {
  piece: "Pièce",
  devis: "Devis",
  acces: "Accès",
  autre: "Autre",
};

export type Role = "prestataire" | "aih_lecture" | "admin";

export const LIBELLE_ROLE: Record<Role, string> = {
  prestataire: "Prestataire",
  aih_lecture: "AIH (lecture)",
  admin: "AIH (admin)",
};

const fmtDate = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeZone: "Europe/Paris" });
const fmtDateHeure = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Paris",
});

export const formaterDate = (iso: string | null) => (iso ? fmtDate.format(new Date(iso)) : "—");
export const formaterDateHeure = (iso: string | null) => (iso ? fmtDateHeure.format(new Date(iso)) : "—");
