import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Pages accessibles sans être connecté. Les API ont leur propre contrôle
// (secret partagé pour les mails et la purge, session pour les documents).
const PUBLIQUES = ["/connexion", "/auth/confirm", "/api/"];

// Rafraîchit la session Supabase à chaque requête et renvoie vers la page de
// connexion si besoin. Les droits réels sont vérifiés dans chaque page et dans la base.
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  // Tant que la base n'est pas branchée, on affiche un message plutôt qu'une erreur.
  if (!url || !cle) {
    return new NextResponse(
      '<!doctype html><meta charset="utf-8"><title>Suivi des interventions</title>' +
        '<p style="font-family:sans-serif;max-width:32rem;margin:4rem auto">' +
        "Suivi des interventions : application en cours de configuration.</p>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  let reponse = NextResponse.next({ request });

  const sb = createServerClient(
    url,
    cle,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (aEcrire) => {
          for (const { name, value } of aEcrire) request.cookies.set(name, value);
          reponse = NextResponse.next({ request });
          for (const { name, value, options } of aEcrire) reponse.cookies.set(name, value, options);
        },
      },
    },
  );

  const {
    data: { user },
  } = await sb.auth.getUser();

  const chemin = request.nextUrl.pathname;
  if (!user && !PUBLIQUES.some((p) => chemin.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/connexion";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return reponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
