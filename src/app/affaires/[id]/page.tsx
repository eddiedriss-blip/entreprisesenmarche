import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeStatut } from "@/components/badge-statut";
import { isoVersParis } from "@/lib/heure-paris";
import { formaterDate, formaterDateHeure, LIBELLE_MOTIF, type Motif, type Statut } from "@/lib/libelles";
import { estAih, exigerProfil } from "@/lib/session";
import { clientServeur, clientUtilisateur } from "@/lib/supabase/serveur";
import { estUuid } from "@/lib/uuid";
import { DepotRapport, FormulaireNote, FormulaireStatut } from "./formulaires";

type Affaire = {
  id: string;
  numero: string;
  locataire_nom: string;
  adresse: string;
  secteur: string | null;
  prestataire_nom: string;
  statut: Statut;
  rdv_le: string | null;
  attente_motif: Motif | null;
  attente_precision: string | null;
  cree_le: string;
  derniere_maj_le: string;
  termine_le: string | null;
  sans_maj_7j: boolean;
};

type Document = { id: string; type: "bon" | "rapport"; nom_fichier: string; taille: number; depose_le: string };

const ko = (octets: number) =>
  octets > 1024 * 1024 ? `${(octets / 1024 / 1024).toFixed(1)} Mo` : `${Math.ceil(octets / 1024)} Ko`;

export default async function PageAffaire(props: PageProps<"/affaires/[id]">) {
  const profil = await exigerProfil();
  const { id } = await props.params;
  if (!estUuid(id)) notFound();

  // Lecture avec les droits de l'utilisateur : une affaire d'un autre
  // prestataire renvoie « introuvable », même en modifiant l'URL.
  const sb = await clientUtilisateur();
  const { data } = await sb.from("affaires_vue").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const affaire = data as Affaire;

  const [{ data: docs }, { data: notes }, { count: nbMails }] = await Promise.all([
    sb.from("documents").select("id, type, nom_fichier, taille, depose_le").eq("affaire_id", id).order("depose_le"),
    sb.from("notes").select("id, texte, cree_le").eq("affaire_id", id).order("cree_le", { ascending: false }),
    estAih(profil)
      ? sb.from("mails_recus").select("id", { count: "exact", head: true }).eq("affaire_id", id)
      : Promise.resolve({ count: null }),
  ]);
  const documents = (docs ?? []) as Document[];

  await clientServeur().rpc("journaliser", {
    p_acteur: profil.id,
    p_action: "affaire_consultee",
    p_affaire: id,
    p_details: {},
  });

  const prestataire = profil.role === "prestataire";
  const bons = documents.filter((d) => d.type === "bon");
  const rapports = documents.filter((d) => d.type === "rapport");

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <Link href="/affaires" className="text-sm text-sky-800 hover:underline">
        ← Retour à la liste
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-xl font-semibold">{affaire.numero}</h1>
        <BadgeStatut statut={affaire.statut} />
        {affaire.sans_maj_7j && (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
            Sans mise à jour depuis plus de 7 jours
          </span>
        )}
      </div>

      <section className="carte mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <Info titre="Locataire">{affaire.locataire_nom}</Info>
        <Info titre="Adresse">{affaire.adresse}</Info>
        <Info titre="Secteur">{affaire.secteur ?? "—"}</Info>
        <Info titre="Prestataire">{affaire.prestataire_nom}</Info>
        <Info titre="Reçue le">{formaterDateHeure(affaire.cree_le)}</Info>
        <Info titre="Dernière mise à jour">{formaterDateHeure(affaire.derniere_maj_le)}</Info>
        {affaire.statut === "rdv_pris" && <Info titre="Rendez-vous">{formaterDateHeure(affaire.rdv_le)}</Info>}
        {affaire.statut === "en_attente" && affaire.attente_motif && (
          <Info titre="En attente">
            {LIBELLE_MOTIF[affaire.attente_motif]}
            {affaire.attente_precision && ` — ${affaire.attente_precision}`}
          </Info>
        )}
        {affaire.termine_le && <Info titre="Terminée le">{formaterDate(affaire.termine_le)}</Info>}
        {nbMails !== null && <Info titre="Mails reçus">{nbMails}</Info>}
      </section>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <section className="carte space-y-3">
          <h2 className="font-semibold">Documents</h2>
          <ListeDocuments titre="Bon d'intervention" documents={bons} />
          <ListeDocuments titre="Rapport d'intervention" documents={rapports} />
          {prestataire && <DepotRapport affaireId={affaire.id} />}
        </section>

        {prestataire && (
          <section className="carte">
            <h2 className="mb-3 font-semibold">Mettre à jour le statut</h2>
            <FormulaireStatut
              affaireId={affaire.id}
              statut={affaire.statut}
              rdvLocal={isoVersParis(affaire.rdv_le)}
              motif={affaire.attente_motif}
              precision={affaire.attente_precision}
            />
          </section>
        )}
      </div>

      <section className="carte mt-4 space-y-3">
        <h2 className="font-semibold">Notes</h2>
        {prestataire && <FormulaireNote affaireId={affaire.id} />}
        <ul className="divide-y divide-slate-100">
          {(notes ?? []).map((n) => (
            <li key={n.id} className="py-2 text-sm">
              <span className="block text-xs text-slate-500">{formaterDateHeure(n.cree_le)}</span>
              <span className="whitespace-pre-wrap">{n.texte}</span>
            </li>
          ))}
        </ul>
        {(notes ?? []).length === 0 && <p className="text-sm text-slate-500">Aucune note.</p>}
      </section>
    </main>
  );
}

function Info({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-slate-500 uppercase">{titre}</div>
      <div>{children}</div>
    </div>
  );
}

function ListeDocuments({ titre, documents }: { titre: string; documents: Document[] }) {
  return (
    <div>
      <h3 className="text-sm font-medium text-slate-700">{titre}</h3>
      {documents.length === 0 ? (
        <p className="text-sm text-slate-500">Aucun.</p>
      ) : (
        <ul className="mt-1 space-y-1 text-sm">
          {documents.map((d) => (
            <li key={d.id}>
              {/* Lien vers notre serveur, qui vérifie les droits puis redirige vers un lien signé de 5 min. */}
              <a href={`/api/documents/${d.id}`} className="text-sky-800 underline">
                {d.nom_fichier}
              </a>{" "}
              <span className="text-slate-500">
                ({ko(d.taille)}, {formaterDate(d.depose_le)})
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
