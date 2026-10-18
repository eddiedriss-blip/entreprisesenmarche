"use client";

import { useRouter } from "next/navigation";
import { useActionState, useRef, useState } from "react";
import { LIBELLE_MOTIF, LIBELLE_STATUT, MOTIFS, STATUTS, type Motif, type Statut } from "@/lib/libelles";
import { clientNavigateur } from "@/lib/supabase/navigateur";
import { ajouterNote, changerStatut, finaliserDepot, preparerDepot, type EtatAction } from "./actions";

function Retour({ etat }: { etat: EtatAction }) {
  if (!etat) return null;
  return (
    <p role="status" className={`text-sm ${etat.ok ? "text-emerald-700" : "text-red-700"}`}>
      {etat.message}
    </p>
  );
}

export function FormulaireStatut(props: {
  affaireId: string;
  statut: Statut;
  rdvLocal: string;
  motif: Motif | null;
  precision: string | null;
}) {
  const [etat, action, enCours] = useActionState<EtatAction, FormData>(
    changerStatut.bind(null, props.affaireId),
    null,
  );
  const [statut, setStatut] = useState<Statut>(props.statut);
  const [motif, setMotif] = useState<string>(props.motif ?? "");

  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm">
        Statut
        <select
          name="statut"
          value={statut}
          onChange={(e) => setStatut(e.target.value as Statut)}
          className="champ mt-1"
        >
          {STATUTS.map((s) => (
            <option key={s} value={s}>
              {LIBELLE_STATUT[s]}
            </option>
          ))}
        </select>
      </label>
      {statut === "rdv_pris" && (
        <label className="block text-sm">
          Date et heure du rendez-vous
          <input type="datetime-local" name="rdv_le" required defaultValue={props.rdvLocal} className="champ mt-1" />
        </label>
      )}
      {statut === "en_attente" && (
        <>
          <label className="block text-sm">
            Motif
            <select name="motif" required value={motif} onChange={(e) => setMotif(e.target.value)} className="champ mt-1">
              <option value="" disabled>
                Choisir…
              </option>
              {MOTIFS.map((m) => (
                <option key={m} value={m}>
                  {LIBELLE_MOTIF[m]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Précision {motif === "autre" ? "(obligatoire)" : "(facultatif)"}
            <input
              name="precision"
              maxLength={300}
              required={motif === "autre"}
              defaultValue={props.precision ?? ""}
              className="champ mt-1"
            />
          </label>
        </>
      )}
      <button className="bouton" disabled={enCours}>
        {enCours ? "Enregistrement…" : "Enregistrer le statut"}
      </button>
      <Retour etat={etat} />
    </form>
  );
}

export function FormulaireNote({ affaireId }: { affaireId: string }) {
  const formulaire = useRef<HTMLFormElement>(null);
  const [etat, action, enCours] = useActionState<EtatAction, FormData>(async (e, fd) => {
    const r = await ajouterNote(affaireId, e, fd);
    if (r?.ok) formulaire.current?.reset();
    return r;
  }, null);
  return (
    <form ref={formulaire} action={action} className="space-y-2">
      <textarea
        name="texte"
        required
        maxLength={2000}
        rows={3}
        className="champ"
        placeholder="Ex. : locataire absent, nouveau passage prévu…"
      />
      <button className="bouton" disabled={enCours}>
        {enCours ? "Ajout…" : "Ajouter la note"}
      </button>
      <Retour etat={etat} />
    </form>
  );
}

const TAILLE_MAX = 10 * 1024 * 1024;

export function DepotRapport({ affaireId }: { affaireId: string }) {
  const router = useRouter();
  const [messages, setMessages] = useState<EtatAction[]>([]);
  const [enCours, setEnCours] = useState(false);

  async function deposer(fichiers: FileList | null) {
    if (!fichiers?.length) return;
    setEnCours(true);
    const retours: EtatAction[] = [];
    for (const f of Array.from(fichiers)) {
      if (f.size > TAILLE_MAX) {
        retours.push({ ok: false, message: `${f.name} : trop volumineux (10 Mo max).` });
        continue;
      }
      const prep = await preparerDepot(affaireId, { taille: f.size, type: f.type });
      if (!prep.ok) {
        retours.push({ ok: false, message: `${f.name} : ${prep.message}` });
        continue;
      }
      const { error } = await clientNavigateur()
        .storage.from("documents")
        .uploadToSignedUrl(prep.chemin, prep.jeton, f, { contentType: f.type });
      if (error) {
        retours.push({ ok: false, message: `${f.name} : envoi impossible, réessayez.` });
        continue;
      }
      const fin = await finaliserDepot(affaireId, prep.chemin, f.name);
      retours.push(fin ? { ...fin, message: `${f.name} : ${fin.message}` } : null);
    }
    setMessages(retours);
    setEnCours(false);
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <label className="bouton-secondaire cursor-pointer">
        {enCours ? "Envoi en cours…" : "Déposer le rapport (PDF ou photos)"}
        <input
          type="file"
          className="sr-only"
          multiple
          disabled={enCours}
          accept="application/pdf,image/jpeg,image/png,image/webp"
          onChange={(e) => {
            void deposer(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      <p className="text-xs text-slate-500">PDF, JPEG, PNG ou WebP · 10 Mo max par fichier.</p>
      {messages.map((m, i) => (
        <Retour key={i} etat={m} />
      ))}
    </div>
  );
}
