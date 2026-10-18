import Link from "next/link";
import { BadgeStatut } from "@/components/badge-statut";
import { formaterDate, LIBELLE_MOTIF, LIBELLE_STATUT, STATUTS, type Motif, type Statut } from "@/lib/libelles";
import { estAih, exigerProfil } from "@/lib/session";
import { clientUtilisateur } from "@/lib/supabase/serveur";
import { estUuid } from "@/lib/uuid";

type LigneAffaire = {
  id: string;
  numero: string;
  locataire_nom: string;
  adresse: string;
  secteur: string | null;
  prestataire_nom: string;
  statut: Statut;
  rdv_le: string | null;
  attente_motif: Motif | null;
  cree_le: string;
  derniere_maj_le: string;
  sans_maj_7j: boolean;
};

const TRIS = {
  creation_desc: { libelle: "Plus récentes d'abord", colonne: "cree_le", croissant: false },
  maj_asc: { libelle: "Sans nouvelles depuis le plus longtemps", colonne: "derniere_maj_le", croissant: true },
  maj_desc: { libelle: "Mises à jour récemment", colonne: "derniere_maj_le", croissant: false },
  statut: { libelle: "Par statut", colonne: "statut", croissant: true },
} as const;

const LIMITE = 500;

export default async function PageAffaires(props: PageProps<"/affaires">) {
  const profil = await exigerProfil();
  const aih = estAih(profil);
  const sp = await props.searchParams;
  const lire = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");

  const statut = lire("statut") || "en_cours";
  const secteur = lire("secteur");
  const prestataire = aih ? lire("prestataire") : "";
  const relance = lire("relance") === "1";
  const tri = (lire("tri") in TRIS ? lire("tri") : "creation_desc") as keyof typeof TRIS;

  const sb = await clientUtilisateur();

  // La RLS limite déjà les lignes à celles que l'utilisateur a le droit de voir.
  let requete = sb
    .from("affaires_vue")
    .select(
      "id, numero, locataire_nom, adresse, secteur, prestataire_nom, statut, rdv_le, attente_motif, cree_le, derniere_maj_le, sans_maj_7j",
    );
  if (statut === "en_cours") requete = requete.neq("statut", "termine");
  else if ((STATUTS as readonly string[]).includes(statut)) requete = requete.eq("statut", statut);
  if (secteur) requete = requete.eq("secteur", secteur);
  if (estUuid(prestataire)) requete = requete.eq("prestataire_id", prestataire);
  if (relance) requete = requete.eq("sans_maj_7j", true);
  requete = requete
    .order(TRIS[tri].colonne, { ascending: TRIS[tri].croissant })
    .order("cree_le", { ascending: false })
    .limit(LIMITE);

  const [{ data: affaires }, { data: secteurs }, { data: prestataires }, { count: nbRelance }] = await Promise.all([
    requete,
    sb.from("affaires").select("secteur").not("secteur", "is", null),
    aih ? sb.from("prestataires").select("id, nom").order("nom") : Promise.resolve({ data: [] }),
    sb.from("affaires_vue").select("id", { count: "exact", head: true }).eq("sans_maj_7j", true),
  ]);
  const lignes = (affaires ?? []) as LigneAffaire[];
  const listeSecteurs = [...new Set((secteurs ?? []).map((s) => s.secteur as string))].sort((a, b) =>
    a.localeCompare(b, "fr"),
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-xl font-semibold">{aih ? "Toutes les affaires" : "Mes affaires"}</h1>

      {(nbRelance ?? 0) > 0 && (
        <p className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <strong>{nbRelance}</strong> affaire{nbRelance! > 1 ? "s" : ""} sans mise à jour depuis plus de 7 jours.{" "}
          {!relance && (
            <Link href="/affaires?relance=1&tri=maj_asc" className="font-medium underline">
              Les afficher
            </Link>
          )}
        </p>
      )}

      <form className="carte mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5" method="get">
        <label className="text-sm">
          Statut
          <select name="statut" defaultValue={statut} className="champ mt-1">
            <option value="en_cours">En cours (hors terminées)</option>
            <option value="toutes">Toutes</option>
            {STATUTS.map((s) => (
              <option key={s} value={s}>
                {LIBELLE_STATUT[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Secteur
          <select name="secteur" defaultValue={secteur} className="champ mt-1">
            <option value="">Tous</option>
            {listeSecteurs.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        {aih && (
          <label className="text-sm">
            Prestataire
            <select name="prestataire" defaultValue={prestataire} className="champ mt-1">
              <option value="">Tous</option>
              {(prestataires ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-sm">
          Tri
          <select name="tri" defaultValue={tri} className="champ mt-1">
            {Object.entries(TRIS).map(([cle, t]) => (
              <option key={cle} value={cle}>
                {t.libelle}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-3">
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" name="relance" value="1" defaultChecked={relance} />
            +7 j sans MAJ
          </label>
          <button className="bouton ml-auto">Filtrer</button>
        </div>
      </form>

      <p className="mt-4 text-sm text-slate-600">
        {lignes.length} affaire{lignes.length > 1 ? "s" : ""}
        {lignes.length === LIMITE && " (affichage limité, affinez les filtres)"}
      </p>

      <ul className="mt-2 space-y-2">
        {lignes.map((a) => (
          <li key={a.id}>
            <Link
              href={`/affaires/${a.id}`}
              className={`carte grid gap-1 hover:border-sky-400 md:grid-cols-[9rem_1fr_10rem_9rem] md:items-center md:gap-4 ${
                a.sans_maj_7j ? "border-l-4 border-l-amber-500" : ""
              }`}
            >
              <span className="font-mono text-sm font-medium">{a.numero}</span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{a.locataire_nom}</span>
                <span className="block truncate text-sm text-slate-600">
                  {a.adresse}
                  {a.secteur && ` · ${a.secteur}`}
                  {aih && ` · ${a.prestataire_nom}`}
                </span>
              </span>
              <span className="text-sm">
                <BadgeStatut statut={a.statut} />
                {a.statut === "rdv_pris" && <span className="block text-slate-600">le {formaterDate(a.rdv_le)}</span>}
                {a.statut === "en_attente" && a.attente_motif && (
                  <span className="block text-slate-600">{LIBELLE_MOTIF[a.attente_motif]}</span>
                )}
              </span>
              <span className={`text-sm ${a.sans_maj_7j ? "font-medium text-amber-800" : "text-slate-600"}`}>
                MAJ {formaterDate(a.derniere_maj_le)}
                {a.sans_maj_7j && <span className="block">+7 j sans nouvelles</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {lignes.length === 0 && <p className="carte mt-2 text-sm text-slate-600">Aucune affaire pour ces filtres.</p>}
    </main>
  );
}
