import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { dependancesSupabase } from "@/lib/mail/dependances-supabase";
import { schemaMailEntrant } from "@/lib/mail/schema";
import { empreinte, traiterMailEntrant } from "@/lib/mail/traitement";
import { jetonValide } from "@/lib/secret";

const TAILLE_REQUETE_MAX = 40 * 1024 * 1024;

// Point d'entrée appelé par le service de réception des mails.
export async function POST(req: NextRequest) {
  if (!jetonValide(req.headers.get("authorization"), env.inboundSecret)) {
    return NextResponse.json({ erreur: "non_autorise" }, { status: 401 });
  }
  if (Number(req.headers.get("content-length") ?? 0) > TAILLE_REQUETE_MAX) {
    return NextResponse.json({ erreur: "trop_volumineux" }, { status: 413 });
  }

  const deps = dependancesSupabase();
  const corps = await req.json().catch(() => null);
  const mail = schemaMailEntrant.safeParse(corps);
  if (!mail.success) {
    const messageId = typeof corps?.messageId === "string" ? corps.messageId : "inconnu";
    await deps.rejeter("format_invalide", null, empreinte(messageId));
    // 200 : inutile que le service de réception renvoie un mail mal formé.
    return NextResponse.json({ statut: "rejete", motif: "format_invalide" });
  }

  try {
    const resultat = await traiterMailEntrant(mail.data, deps, env.domainesAutorises);
    return NextResponse.json(resultat);
  } catch (e) {
    console.error("Erreur de traitement d'un mail entrant", e instanceof Error ? e.message : e);
    // 500 : le service de réception réessaiera ; le traitement est idempotent.
    return NextResponse.json({ erreur: "erreur_interne" }, { status: 500 });
  }
}
