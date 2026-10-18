import { NextResponse, type NextRequest } from "next/server";
import { clientUtilisateur } from "@/lib/supabase/serveur";

export async function POST(req: NextRequest) {
  const sb = await clientUtilisateur();
  await sb.auth.signOut();
  return NextResponse.redirect(new URL("/connexion", req.url), 303);
}
