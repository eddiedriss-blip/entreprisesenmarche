import { redirect } from "next/navigation";
import { profilCourant } from "@/lib/session";
import { FormulaireConnexion } from "./formulaire";

const ERREURS: Record<string, string> = {
  lien: "Ce lien de connexion n'est plus valable. Demandez-en un nouveau.",
  compte: "Ce compte n'est pas actif. Contactez AIH.",
};

export default async function PageConnexion(props: PageProps<"/connexion">) {
  if (await profilCourant()) redirect("/affaires");
  const { erreur } = await props.searchParams;
  const messageErreur = typeof erreur === "string" ? ERREURS[erreur] : undefined;

  return (
    <main className="mx-auto mt-16 w-full max-w-sm px-4">
      <h1 className="text-xl font-semibold">Suivi des interventions</h1>
      <p className="mt-1 mb-6 text-sm text-slate-600">
        Saisissez votre adresse mail : vous recevrez un lien pour vous connecter, sans mot de passe.
      </p>
      {messageErreur && <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-800">{messageErreur}</p>}
      <FormulaireConnexion />
    </main>
  );
}
