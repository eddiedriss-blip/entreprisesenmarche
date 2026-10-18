import { NextResponse, type NextRequest } from "next/server";
import { profilCourant } from "@/lib/session";
import { BUCKET, clientServeur, clientUtilisateur } from "@/lib/supabase/serveur";
import { estUuid } from "@/lib/uuid";

const DUREE_LIEN_SECONDES = 300;

// Téléchargement d'un bon ou d'un rapport : droits vérifiés, accès journalisé,
// puis redirection vers un lien signé valable 5 minutes.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/documents/[id]">) {
  const { id } = await ctx.params;
  const profil = await profilCourant();
  if (!profil) return NextResponse.json({ erreur: "non_connecte" }, { status: 401 });
  if (!estUuid(id)) return NextResponse.json({ erreur: "introuvable" }, { status: 404 });

  // Lecture avec les droits de l'utilisateur : la RLS masque les documents
  // des affaires qui ne sont pas les siennes.
  const sb = await clientUtilisateur();
  const { data: doc } = await sb
    .from("documents")
    .select("chemin, nom_fichier, affaire_id, type")
    .eq("id", id)
    .maybeSingle();
  if (!doc) return NextResponse.json({ erreur: "introuvable" }, { status: 404 });

  const admin = clientServeur();
  const { data: lien, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(doc.chemin, DUREE_LIEN_SECONDES, { download: doc.nom_fichier });
  if (error || !lien) return NextResponse.json({ erreur: "indisponible" }, { status: 502 });

  await admin.rpc("journaliser", {
    p_acteur: profil.id,
    p_action: "document_telecharge",
    p_affaire: doc.affaire_id,
    p_details: { document_id: id, type: doc.type },
  });

  const reponse = NextResponse.redirect(lien.signedUrl, 303);
  reponse.headers.set("Cache-Control", "no-store");
  return reponse;
}
