"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { exigerAdmin } from "@/lib/session";
import { clientServeur, clientUtilisateur } from "@/lib/supabase/serveur";

// Chaque action vérifie le rôle admin ici, puis la base le revérifie dans la
// fonction appelée (admin_*). Le résultat est affiché via l'URL.
function retour(message: string, erreur = false): never {
  redirect(`/admin?${erreur ? "erreur" : "ok"}=${encodeURIComponent(message)}`);
}

async function rpcAdmin(fonction: string, params: Record<string, unknown>, succes: string) {
  await exigerAdmin();
  const sb = await clientUtilisateur();
  const { error } = await sb.rpc(fonction, params);
  if (error) {
    const doublon = error.code === "23505";
    retour(doublon ? "Cet élément existe déjà." : "Opération refusée ou invalide.", true);
  }
  retour(succes);
}

const email = z.email().transform((e) => e.trim().toLowerCase());
const uuid = z.uuid();

export async function creerPrestataire(fd: FormData) {
  const nom = z.string().trim().min(1).max(120).safeParse(fd.get("nom"));
  if (!nom.success) retour("Nom invalide.", true);
  await rpcAdmin("admin_creer_prestataire", { p_nom: nom.data }, "Prestataire créé.");
}

export async function activerPrestataire(fd: FormData) {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) retour("Requête invalide.", true);
  await rpcAdmin("admin_activer_prestataire", { p_id: id.data, p_actif: fd.get("actif") === "1" }, "Prestataire mis à jour.");
}

export async function ajouterAdresse(fd: FormData) {
  const p = z.object({ prestataire: uuid, email }).safeParse(Object.fromEntries(fd));
  if (!p.success) retour("Adresse invalide.", true);
  await rpcAdmin("admin_ajouter_adresse", { p_prestataire: p.data.prestataire, p_email: p.data.email }, "Adresse ajoutée.");
}

export async function retirerAdresse(fd: FormData) {
  const e = email.safeParse(fd.get("email"));
  if (!e.success) retour("Adresse invalide.", true);
  await rpcAdmin("admin_retirer_adresse", { p_email: e.data }, "Adresse retirée.");
}

export async function activerCompte(fd: FormData) {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) retour("Requête invalide.", true);
  await rpcAdmin("admin_activer_profil", { p_id: id.data, p_actif: fd.get("actif") === "1" }, "Compte mis à jour.");
}

export async function modifierParametres(fd: FormData) {
  const p = z
    .object({
      conservation: z.coerce.number().int().min(30).max(3650),
      journal: z.coerce.number().int().min(30).max(3650),
    })
    .safeParse(Object.fromEntries(fd));
  if (!p.success) retour("Durées invalides (entre 30 et 3650 jours).", true);
  await rpcAdmin(
    "admin_modifier_parametres",
    { p_conservation: p.data.conservation, p_journal: p.data.journal },
    "Paramètres enregistrés.",
  );
}

const schemaCompte = z
  .object({
    email,
    role: z.enum(["prestataire", "aih_lecture", "admin"]),
    prestataire: z.string().optional(),
  })
  .refine((c) => c.role !== "prestataire" || uuid.safeParse(c.prestataire).success);

export async function creerCompte(fd: FormData) {
  const admin = await exigerAdmin();
  const c = schemaCompte.safeParse(Object.fromEntries(fd));
  if (!c.success) retour("Compte invalide : vérifiez l'adresse et le prestataire.", true);

  // Le compte d'authentification ne peut être créé qu'avec la clé serveur.
  const serveur = clientServeur();
  const { data, error } = await serveur.auth.admin.createUser({ email: c.data.email, email_confirm: true });
  if (error || !data.user) retour("Impossible de créer le compte (adresse déjà utilisée ?).", true);

  const { error: errProfil } = await serveur.rpc("creer_profil", {
    p_admin: admin.id,
    p_id: data.user.id,
    p_email: c.data.email,
    p_role: c.data.role,
    p_prestataire: c.data.role === "prestataire" ? c.data.prestataire : null,
  });
  if (errProfil) {
    await serveur.auth.admin.deleteUser(data.user.id);
    retour("Impossible de créer le profil.", true);
  }
  retour(`Compte créé pour ${c.data.email}. La personne peut se connecter avec son adresse.`);
}
