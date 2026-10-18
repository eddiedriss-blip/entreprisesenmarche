"use client";

import { useActionState } from "react";
import { envoyerLien, type EtatConnexion } from "./actions";

export function FormulaireConnexion() {
  const [etat, action, enCours] = useActionState<EtatConnexion, FormData>(envoyerLien, null);
  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="text-sm font-medium">Adresse mail</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          className="champ mt-1"
          placeholder="prenom.nom@entreprise.fr"
        />
      </label>
      <button type="submit" disabled={enCours} className="bouton w-full">
        {enCours ? "Envoi…" : "Recevoir un lien de connexion"}
      </button>
      {etat && (
        <p role="status" className={`text-sm ${etat.erreur ? "text-red-700" : "text-slate-700"}`}>
          {etat.message}
        </p>
      )}
    </form>
  );
}
