import { formaterDateHeure, LIBELLE_ROLE, type Role } from "@/lib/libelles";
import { exigerAdmin } from "@/lib/session";
import { clientUtilisateur } from "@/lib/supabase/serveur";
import {
  activerCompte,
  activerPrestataire,
  ajouterAdresse,
  creerCompte,
  creerPrestataire,
  modifierParametres,
  retirerAdresse,
} from "./actions";

const MOTIFS_REJET: Record<string, string> = {
  expediteur_non_autorise: "Expéditeur non autorisé",
  destinataire_inconnu: "Destinataire principal inconnu",
  aucun_bon_pdf: "Aucun bon PDF valide en pièce jointe",
  bon_illisible: "Bon illisible",
  format_invalide: "Format de mail invalide",
};

export default async function PageAdmin(props: PageProps<"/admin">) {
  const moi = await exigerAdmin();
  const sp = await props.searchParams;
  const sb = await clientUtilisateur();

  const [{ data: prestataires }, { data: adresses }, { data: comptes }, { data: parametres }, { data: rejets }, { data: journal }] =
    await Promise.all([
      sb.from("prestataires").select("id, nom, actif").order("nom"),
      sb.from("prestataire_adresses").select("email, prestataire_id").order("email"),
      sb.from("profils").select("id, email, role, prestataire_id, actif").order("email"),
      sb.from("parametres").select("duree_conservation_jours, duree_journal_jours").single(),
      sb.from("mails_rejetes").select("id, le, motif, domaine_expediteur").order("le", { ascending: false }).limit(50),
      sb.from("journal").select("id, le, acteur_email, action, numero, details").order("id", { ascending: false }).limit(200),
    ]);
  const nomPrestataire = new Map((prestataires ?? []).map((p) => [p.id, p.nom as string]));

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <h1 className="text-xl font-semibold">Administration</h1>
      {typeof sp.ok === "string" && <p className="rounded bg-emerald-50 p-3 text-sm text-emerald-800">{sp.ok}</p>}
      {typeof sp.erreur === "string" && <p className="rounded bg-red-50 p-3 text-sm text-red-800">{sp.erreur}</p>}

      <section className="carte">
        <h2 className="mb-3 font-semibold">Conservation des données</h2>
        <form action={modifierParametres} className="flex flex-wrap items-end gap-4 text-sm">
          <label>
            Affaires terminées conservées (jours)
            <input name="conservation" type="number" min={30} max={3650} required defaultValue={parametres?.duree_conservation_jours} className="champ mt-1 w-32" />
          </label>
          <label>
            Journal conservé (jours)
            <input name="journal" type="number" min={30} max={3650} required defaultValue={parametres?.duree_journal_jours} className="champ mt-1 w-32" />
          </label>
          <button className="bouton">Enregistrer</button>
        </form>
        <p className="mt-2 text-xs text-slate-500">La purge automatique a lieu chaque nuit à 3 h (heure UTC).</p>
      </section>

      <section className="carte">
        <h2 className="mb-3 font-semibold">Prestataires</h2>
        <form action={creerPrestataire} className="mb-4 flex gap-2">
          <input name="nom" required maxLength={120} placeholder="Nom du prestataire" className="champ max-w-xs" />
          <button className="bouton">Ajouter</button>
        </form>
        <ul className="space-y-3">
          {(prestataires ?? []).map((p) => (
            <li key={p.id} className="rounded border border-slate-200 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-3">
                <strong>{p.nom}</strong>
                {!p.actif && <span className="rounded bg-slate-200 px-2 text-xs">désactivé</span>}
                <form action={activerPrestataire} className="ml-auto">
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="actif" value={p.actif ? "0" : "1"} />
                  <button className="bouton-secondaire">{p.actif ? "Désactiver" : "Réactiver"}</button>
                </form>
              </div>
              <p className="mt-2 text-xs text-slate-500">Adresses qui attribuent une affaire à ce prestataire (destinataire « À ») :</p>
              <ul className="mt-1 space-y-1">
                {(adresses ?? [])
                  .filter((a) => a.prestataire_id === p.id)
                  .map((a) => (
                    <li key={a.email} className="flex items-center gap-2">
                      <span className="font-mono">{a.email}</span>
                      <form action={retirerAdresse}>
                        <input type="hidden" name="email" value={a.email} />
                        <button className="text-xs text-red-700 underline">retirer</button>
                      </form>
                    </li>
                  ))}
              </ul>
              <form action={ajouterAdresse} className="mt-2 flex gap-2">
                <input type="hidden" name="prestataire" value={p.id} />
                <input name="email" type="email" required placeholder="contact@prestataire.fr" className="champ max-w-xs" />
                <button className="bouton-secondaire">Ajouter l&apos;adresse</button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section className="carte">
        <h2 className="mb-3 font-semibold">Comptes utilisateurs</h2>
        <form action={creerCompte} className="mb-4 grid gap-2 text-sm sm:grid-cols-4">
          <input name="email" type="email" required placeholder="adresse mail" className="champ" />
          <select name="role" className="champ" defaultValue="prestataire">
            {(Object.keys(LIBELLE_ROLE) as Role[]).map((r) => (
              <option key={r} value={r}>
                {LIBELLE_ROLE[r]}
              </option>
            ))}
          </select>
          <select name="prestataire" className="champ" defaultValue="">
            <option value="">— prestataire (si rôle prestataire) —</option>
            {(prestataires ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
              </option>
            ))}
          </select>
          <button className="bouton">Créer le compte</button>
        </form>
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-slate-500 uppercase">
            <tr>
              <th className="py-1">Adresse</th>
              <th>Rôle</th>
              <th>Prestataire</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(comptes ?? []).map((c) => (
              <tr key={c.id} className={c.actif ? "" : "text-slate-400"}>
                <td className="py-1.5 font-mono">{c.email}</td>
                <td>{LIBELLE_ROLE[c.role as Role]}</td>
                <td>{c.prestataire_id ? nomPrestataire.get(c.prestataire_id) : "—"}</td>
                <td className="text-right">
                  {c.id !== moi.id && (
                    <form action={activerCompte}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="actif" value={c.actif ? "0" : "1"} />
                      <button className="bouton-secondaire">{c.actif ? "Désactiver" : "Réactiver"}</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="carte">
        <h2 className="mb-3 font-semibold">Mails ignorés (50 derniers)</h2>
        {(rejets ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">Aucun.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {(rejets ?? []).map((r) => (
              <li key={r.id}>
                {formaterDateHeure(r.le)} — {MOTIFS_REJET[r.motif] ?? r.motif}
                {r.domaine_expediteur && <span className="text-slate-500"> (domaine : {r.domaine_expediteur})</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="carte">
        <h2 className="mb-3 font-semibold">Journal des accès et modifications (200 dernières lignes)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500 uppercase">
              <tr>
                <th className="py-1">Date</th>
                <th>Qui</th>
                <th>Action</th>
                <th>Affaire</th>
                <th>Détails</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {(journal ?? []).map((j) => (
                <tr key={j.id}>
                  <td className="py-1 whitespace-nowrap">{formaterDateHeure(j.le)}</td>
                  <td>{j.acteur_email ?? "système"}</td>
                  <td>{j.action}</td>
                  <td>{j.numero ?? ""}</td>
                  <td className="max-w-xs truncate">{Object.keys(j.details ?? {}).length ? JSON.stringify(j.details) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
