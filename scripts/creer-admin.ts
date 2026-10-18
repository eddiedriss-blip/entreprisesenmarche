// Crée (ou réactive) un compte administrateur AIH. Sert pour le tout premier
// admin, les suivants pouvant être créés depuis la page Administration.
// Usage : npm run admin -- prenom.nom@exemple.fr
import { clientServeur } from "./lib/config";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error("Usage : npm run admin -- <adresse mail>");
    process.exit(1);
  }
  const sb = clientServeur();

  const { data: existant } = await sb.from("profils").select("id, role").eq("email", email).maybeSingle();
  if (existant) {
    const { error } = await sb.from("profils").update({ role: "admin", prestataire_id: null, actif: true }).eq("id", existant.id);
    if (error) throw new Error(error.message);
    console.log(`Compte existant passé administrateur : ${email}`);
    return;
  }

  const { data, error } = await sb.auth.admin.createUser({ email, email_confirm: true });
  if (error || !data.user) throw new Error(`création du compte : ${error?.message}`);
  const { error: errProfil } = await sb.from("profils").insert({ id: data.user.id, email, role: "admin" });
  if (errProfil) {
    await sb.auth.admin.deleteUser(data.user.id);
    throw new Error(`création du profil : ${errProfil.message}`);
  }
  console.log(`Administrateur créé : ${email}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
