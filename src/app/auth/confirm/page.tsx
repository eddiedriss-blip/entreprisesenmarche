import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { clientServeur, clientUtilisateur } from "@/lib/supabase/serveur";

const TYPES_ACCEPTES: EmailOtpType[] = ["email", "magiclink"];

// Le lien du mail mène ici, mais la connexion n'a lieu qu'au clic sur le
// bouton : les antivirus de messagerie qui « visitent » les liens ne
// consomment donc pas le lien à usage unique.
async function confirmer(formData: FormData) {
  "use server";
  const sb = await clientUtilisateur();
  const tokenHash = String(formData.get("token_hash") ?? "");
  const type = String(formData.get("type") ?? "") as EmailOtpType;
  const code = String(formData.get("code") ?? "");

  const { error } = tokenHash && TYPES_ACCEPTES.includes(type)
    ? await sb.auth.verifyOtp({ token_hash: tokenHash, type })
    : code
      ? await sb.auth.exchangeCodeForSession(code)
      : { error: new Error("lien incomplet") };
  if (error) redirect("/connexion?erreur=lien");

  const {
    data: { user },
  } = await sb.auth.getUser();
  const { data: profil } = user
    ? await sb.from("profils").select("id").eq("id", user.id).eq("actif", true).maybeSingle()
    : { data: null };
  if (!profil) {
    await sb.auth.signOut();
    redirect("/connexion?erreur=compte");
  }

  await clientServeur().rpc("journaliser", {
    p_acteur: profil.id,
    p_action: "connexion",
    p_affaire: null,
    p_details: {},
  });
  redirect("/affaires");
}

export default async function PageConfirmation(props: PageProps<"/auth/confirm">) {
  const params = await props.searchParams;
  const champ = (nom: string) => (typeof params[nom] === "string" ? (params[nom] as string) : "");

  return (
    <main className="mx-auto mt-16 w-full max-w-sm px-4">
      <h1 className="text-xl font-semibold">Connexion</h1>
      <form action={confirmer} className="mt-6">
        <input type="hidden" name="token_hash" value={champ("token_hash")} />
        <input type="hidden" name="type" value={champ("type")} />
        <input type="hidden" name="code" value={champ("code")} />
        <button type="submit" className="bouton w-full">
          Me connecter
        </button>
      </form>
    </main>
  );
}
