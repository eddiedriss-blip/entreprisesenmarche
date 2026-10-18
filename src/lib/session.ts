import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Role } from "@/lib/libelles";
import { clientUtilisateur } from "@/lib/supabase/serveur";

export type Profil = {
  id: string;
  email: string;
  role: Role;
  prestataire_id: string | null;
};

/** Profil actif de l'utilisateur connecté, ou null. Vérifié auprès de Supabase. */
export const profilCourant = cache(async (): Promise<Profil | null> => {
  const sb = await clientUtilisateur();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb
    .from("profils")
    .select("id, email, role, prestataire_id")
    .eq("id", user.id)
    .eq("actif", true)
    .maybeSingle();
  return (data as Profil | null) ?? null;
});

export async function exigerProfil(): Promise<Profil> {
  const profil = await profilCourant();
  if (!profil) redirect("/connexion");
  return profil;
}

export async function exigerAdmin(): Promise<Profil> {
  const profil = await exigerProfil();
  if (profil.role !== "admin") redirect("/affaires");
  return profil;
}

export const estAih = (p: Profil) => p.role === "aih_lecture" || p.role === "admin";
