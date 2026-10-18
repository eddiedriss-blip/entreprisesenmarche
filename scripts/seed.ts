// Crée le jeu de test FICTIF : 2 prestataires, leurs adresses, et 4 comptes.
// Usage : npm run seed   (relançable sans risque)
import { clientServeur, COMPTES_AIH_TEST, PRESTATAIRES_TEST } from "./lib/config";

const sb = clientServeur();

async function compte(email: string, role: string, prestataireId: string | null) {
  const { data: existant } = await sb.from("profils").select("id").eq("email", email).maybeSingle();
  if (existant) return console.log(`  compte déjà présent : ${email}`);

  const { data, error } = await sb.auth.admin.createUser({ email, email_confirm: true });
  if (error || !data.user) throw new Error(`création ${email} : ${error?.message}`);
  const { error: errProfil } = await sb
    .from("profils")
    .insert({ id: data.user.id, email, role, prestataire_id: prestataireId });
  if (errProfil) throw new Error(`profil ${email} : ${errProfil.message}`);
  console.log(`  compte créé : ${email} (${role})`);
}

async function main() {
  console.log("Prestataires :");
  for (const p of PRESTATAIRES_TEST) {
    let { data: presta } = await sb.from("prestataires").select("id").eq("nom", p.nom).maybeSingle();
    if (!presta) {
      const res = await sb.from("prestataires").insert({ nom: p.nom }).select("id").single();
      if (res.error) throw new Error(res.error.message);
      presta = res.data;
      console.log(`  créé : ${p.nom}`);
    }
    await sb.from("prestataire_adresses").upsert({ email: p.adresse, prestataire_id: presta.id });
    await compte(p.compte, "prestataire", presta.id);
  }
  console.log("Comptes AIH :");
  for (const c of COMPTES_AIH_TEST) await compte(c.email, c.role, null);
  console.log("\nTerminé. Pour se connecter sans recevoir de mail : npm run lien -- <adresse>");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
