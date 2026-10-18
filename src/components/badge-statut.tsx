import { COULEUR_STATUT, LIBELLE_STATUT, type Statut } from "@/lib/libelles";

export function BadgeStatut({ statut }: { statut: Statut }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${COULEUR_STATUT[statut]}`}>
      {LIBELLE_STATUT[statut]}
    </span>
  );
}
