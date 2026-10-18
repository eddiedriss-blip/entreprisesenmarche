// Affiche un lien de connexion pour un compte de test, sans envoyer de mail
// (les adresses du jeu de test sont fictives et ne reçoivent rien).
// Usage : npm run lien -- plombier@plomberie-fictive.test
import { appUrl, clientServeur } from "./lib/config";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("Usage : npm run lien -- <adresse mail du compte>");
    process.exit(1);
  }
  const { data, error } = await clientServeur().auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw new Error(error.message);
  const url = new URL("/auth/confirm", appUrl());
  url.searchParams.set("token_hash", data.properties.hashed_token);
  url.searchParams.set("type", "magiclink");
  console.log(`Lien de connexion pour ${email} (usage unique, valable 1 h) :\n\n${url}\n`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
