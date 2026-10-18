import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { jetonValide } from "@/lib/secret";
import { BUCKET, clientServeur } from "@/lib/supabase/serveur";

// Purge quotidienne (Vercel Cron, voir vercel.json) :
//  1. affaires terminées au-delà de la durée de conservation, avec leurs fichiers ;
//  2. lignes du journal et mails rejetés au-delà de leur durée de conservation.
export async function GET(req: NextRequest) {
  if (!jetonValide(req.headers.get("authorization"), env.cronSecret)) {
    return NextResponse.json({ erreur: "non_autorise" }, { status: 401 });
  }
  const sb = clientServeur();

  const { data: aPurger, error } = await sb.rpc("affaires_a_purger");
  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  const purgees: string[] = [];
  for (const { o_affaire, o_chemins } of (aPurger ?? []) as { o_affaire: string; o_chemins: string[] }[]) {
    // Fichiers d'abord : si leur suppression échoue, l'affaire est gardée et
    // la purge réessaiera le lendemain.
    if (o_chemins.length > 0) {
      const { error: errStockage } = await sb.storage.from(BUCKET).remove(o_chemins);
      if (errStockage) continue;
    }
    purgees.push(o_affaire);
  }

  let affaires = 0;
  if (purgees.length > 0) {
    const { data, error: errSuppr } = await sb.rpc("supprimer_affaires_purgees", { p_ids: purgees });
    if (errSuppr) return NextResponse.json({ erreur: errSuppr.message }, { status: 500 });
    affaires = data as number;
  }

  const { data: lignesJournal, error: errJournal } = await sb.rpc("purger_journal");
  if (errJournal) return NextResponse.json({ erreur: errJournal.message }, { status: 500 });

  return NextResponse.json({ affaires_purgees: affaires, lignes_journal_purgees: lignesJournal });
}
