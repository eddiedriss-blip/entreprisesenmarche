// Tests des droits dans la base : chaque règle de sécurité est vérifiée en se
// mettant dans la peau d'un utilisateur (prestataire, AIH, anonyme, serveur).
import { readFileSync, readdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type Role = "anon" | "authenticated" | "service_role";

let pg: EmbeddedPostgres;
let db: Client;

const ids = {
  prestaA: "a0000000-0000-4000-8000-000000000001",
  prestaB: "b0000000-0000-4000-8000-000000000001",
  userA: "a0000000-0000-4000-8000-0000000000aa",
  userB: "b0000000-0000-4000-8000-0000000000bb",
  lecteur: "c0000000-0000-4000-8000-0000000000cc",
  admin: "d0000000-0000-4000-8000-0000000000dd",
  inactif: "e0000000-0000-4000-8000-0000000000ee",
};
let affaireA = "";
let affaireB = "";

/** Exécute une requête dans une transaction, avec le rôle et l'utilisateur donnés. */
async function q<T = Record<string, unknown>>(
  role: Role,
  uid: string | null,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  await db.query("begin");
  try {
    await db.query(`set local role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid ?? ""]);
    const res = await db.query(sql, params);
    await db.query("commit");
    return res.rows as T[];
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
}

const presta = (uid: string, sql: string, params: unknown[] = []) => q("authenticated", uid, sql, params);
const serveur = (sql: string, params: unknown[] = []) => q("service_role", null, sql, params);

async function creerAffaire(numero: string, prestataire: string, messageId: string) {
  const [r] = await serveur(
    "select public.creer_ou_rattacher_affaire($1, 'NOM FICTIF', '1 rue Fictive 38000 Testville', 'Secteur Test', $2, $3, 'agent@aih.test', 'contact@presta.test') as r",
    [numero, prestataire, messageId],
  );
  return (r as { r: { affaire_id: string; resultat: string } }).r;
}

beforeAll(async () => {
  const port = 54000 + Math.floor(Math.random() * 900);
  pg = new EmbeddedPostgres({
    databaseDir: mkdtempSync(join(tmpdir(), "pg-suivi-")),
    user: "postgres",
    password: "postgres",
    port,
    persistent: false,
    onLog: () => {},
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("test");
  db = pg.getPgClient("test");
  await db.connect();

  await db.query(readFileSync(join(__dirname, "shim-supabase.sql"), "utf8"));
  const dossier = join(__dirname, "../../supabase/migrations");
  for (const f of readdirSync(dossier).sort()) {
    await db.query(readFileSync(join(dossier, f), "utf8"));
  }

  // Jeu de données fictif.
  const comptes: [string, string, string, string | null, boolean][] = [
    [ids.userA, "a@presta-a.test", "prestataire", ids.prestaA, true],
    [ids.userB, "b@presta-b.test", "prestataire", ids.prestaB, true],
    [ids.lecteur, "lecture@aih.test", "aih_lecture", null, true],
    [ids.admin, "admin@aih.test", "admin", null, true],
    [ids.inactif, "inactif@presta-a.test", "prestataire", ids.prestaA, false],
  ];
  await db.query("insert into public.prestataires (id, nom) values ($1, 'Prestataire A'), ($2, 'Prestataire B')", [ids.prestaA, ids.prestaB]);
  for (const [id, email, role, prestataire, actif] of comptes) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
    await db.query(
      "insert into public.profils (id, email, role, prestataire_id, actif) values ($1, $2, $3, $4, $5)",
      [id, email, role, prestataire, actif],
    );
  }
  affaireA = (await creerAffaire("INT-0001", ids.prestaA, "<m1@aih.test>")).affaire_id;
  affaireB = (await creerAffaire("INT-0002", ids.prestaB, "<m2@aih.test>")).affaire_id;
}, 120_000);

afterAll(async () => {
  await db?.end();
  await pg?.stop();
});

describe("cloisonnement des prestataires", () => {
  it("un prestataire ne voit que ses affaires", async () => {
    const rows = await presta(ids.userA, "select numero from public.affaires_vue");
    expect(rows.map((r) => r.numero)).toEqual(["INT-0001"]);
  });

  it("même en demandant directement l'identifiant d'une autre affaire", async () => {
    const rows = await presta(ids.userA, "select * from public.affaires where id = $1", [affaireB]);
    expect(rows).toHaveLength(0);
  });

  it("ne voit ni les notes ni les documents d'une autre affaire", async () => {
    await presta(ids.userB, "select public.ajouter_note($1, 'note de B')", [affaireB]);
    await serveur(
      "select public.enregistrer_document($1, 'bon', 'affaires/x/bon/1.pdf', 'bon.pdf', 'application/pdf', 1000, $2, null)",
      [affaireB, "a".repeat(64)],
    );
    expect(await presta(ids.userA, "select * from public.notes where affaire_id = $1", [affaireB])).toHaveLength(0);
    expect(await presta(ids.userA, "select * from public.documents where affaire_id = $1", [affaireB])).toHaveLength(0);
    expect(await presta(ids.userB, "select * from public.documents where affaire_id = $1", [affaireB])).toHaveLength(1);
  });

  it("ne voit que son propre prestataire et aucune adresse", async () => {
    expect((await presta(ids.userA, "select nom from public.prestataires")).map((r) => r.nom)).toEqual(["Prestataire A"]);
    expect(await presta(ids.userA, "select * from public.prestataire_adresses")).toHaveLength(0);
  });

  it("ne peut pas modifier une table directement", async () => {
    await expect(presta(ids.userA, "update public.affaires set statut = 'termine'")).rejects.toThrow(/permission denied/);
    await expect(
      presta(ids.userA, "insert into public.notes (affaire_id, texte) values ($1, 'x')", [affaireA]),
    ).rejects.toThrow(/permission denied/);
  });

  it("ne peut pas changer le statut d'une affaire qui n'est pas la sienne", async () => {
    await expect(
      presta(ids.userA, "select public.changer_statut($1, 'client_appele')", [affaireB]),
    ).rejects.toThrow(/acces_refuse/);
    await expect(presta(ids.userA, "select public.ajouter_note($1, 'intrusion')", [affaireB])).rejects.toThrow(/acces_refuse/);
  });

  it("ne peut pas appeler les fonctions réservées au serveur", async () => {
    await expect(
      presta(ids.userA, "select public.creer_ou_rattacher_affaire('X1','n','a',null,$1,'<x>','a@aih.test','b@b.test')", [ids.prestaA]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      presta(ids.userA, "select public.journaliser($1, 'faux', null, '{}')", [ids.userA]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      presta(ids.userA, "select public.enregistrer_document($1,'rapport','p','n','application/pdf',1,$2,$3)", [affaireA, "b".repeat(64), ids.userA]),
    ).rejects.toThrow(/permission denied/);
  });

  it("un compte désactivé ne voit plus rien et ne peut plus agir", async () => {
    expect(await presta(ids.inactif, "select * from public.affaires")).toHaveLength(0);
    await expect(presta(ids.inactif, "select public.changer_statut($1, 'client_appele')", [affaireA])).rejects.toThrow(/acces_refuse/);
  });

  it("un visiteur anonyme n'a accès à rien", async () => {
    await expect(q("anon", null, "select * from public.affaires")).rejects.toThrow(/permission denied/);
    await expect(q("anon", null, "select * from public.affaires_vue")).rejects.toThrow(/permission denied/);
  });
});

describe("statuts et notes", () => {
  it("vérifie les informations obligatoires selon le statut", async () => {
    await expect(presta(ids.userA, "select public.changer_statut($1, 'rdv_pris')", [affaireA])).rejects.toThrow(/date_rdv_requise/);
    await expect(presta(ids.userA, "select public.changer_statut($1, 'en_attente')", [affaireA])).rejects.toThrow(/motif_requis/);
    await expect(
      presta(ids.userA, "select public.changer_statut($1, 'en_attente', null, 'autre', '  ')", [affaireA]),
    ).rejects.toThrow(/precision_requise/);
  });

  it("enregistre le changement de statut et le journalise", async () => {
    await presta(ids.userA, "select public.changer_statut($1, 'rdv_pris', '2026-11-03 09:00+01')", [affaireA]);
    await presta(ids.userA, "select public.changer_statut($1, 'en_attente', null, 'piece', 'Pièce commandée')", [affaireA]);
    const [a] = await presta(ids.userA, "select statut, attente_motif, attente_precision, rdv_le from public.affaires where id = $1", [affaireA]);
    expect(a).toMatchObject({ statut: "en_attente", attente_motif: "piece", attente_precision: "Pièce commandée" });
    expect(a.rdv_le).not.toBeNull();
    const journal = await q("authenticated", ids.admin, "select action, acteur_email, details from public.journal where affaire_id = $1 and action = 'statut_modifie' order by id", [affaireA]);
    expect(journal).toHaveLength(2);
    expect(journal[1]).toMatchObject({ acteur_email: "a@presta-a.test", details: { de: "rdv_pris", vers: "en_attente", motif: "piece" } });
  });

  it("terminer renseigne la date de fin, revenir en arrière l'efface", async () => {
    await presta(ids.userA, "select public.changer_statut($1, 'termine')", [affaireA]);
    expect((await presta(ids.userA, "select termine_le from public.affaires where id = $1", [affaireA]))[0].termine_le).not.toBeNull();
    await presta(ids.userA, "select public.changer_statut($1, 'intervenu')", [affaireA]);
    const [a] = await presta(ids.userA, "select termine_le, attente_motif from public.affaires where id = $1", [affaireA]);
    expect(a).toMatchObject({ termine_le: null, attente_motif: null });
  });

  it("refuse une note vide", async () => {
    await expect(presta(ids.userA, "select public.ajouter_note($1, '   ')", [affaireA])).rejects.toThrow(/note_invalide/);
  });
});

describe("comptes AIH", () => {
  it("la lecture voit toutes les affaires mais ne peut rien modifier", async () => {
    expect(await q("authenticated", ids.lecteur, "select * from public.affaires_vue")).toHaveLength(2);
    await expect(q("authenticated", ids.lecteur, "select public.changer_statut($1, 'termine')", [affaireA])).rejects.toThrow(/acces_refuse/);
    await expect(q("authenticated", ids.lecteur, "select public.ajouter_note($1, 'x')", [affaireA])).rejects.toThrow(/acces_refuse/);
    await expect(q("authenticated", ids.lecteur, "select public.admin_creer_prestataire('Pirate')")).rejects.toThrow(/acces_refuse/);
  });

  it("seul l'admin lit le journal", async () => {
    expect(await q("authenticated", ids.lecteur, "select * from public.journal")).toHaveLength(0);
    expect(await presta(ids.userA, "select * from public.journal")).toHaveLength(0);
    expect((await q("authenticated", ids.admin, "select * from public.journal")).length).toBeGreaterThan(0);
  });

  it("met en avant les affaires sans mise à jour depuis 7 jours", async () => {
    await db.query("update public.affaires set derniere_maj_le = now() - interval '8 days' where id = $1", [affaireB]);
    const rows = await q("authenticated", ids.lecteur, "select numero, sans_maj_7j from public.affaires_vue order by numero");
    expect(rows).toEqual([
      { numero: "INT-0001", sans_maj_7j: false },
      { numero: "INT-0002", sans_maj_7j: true },
    ]);
  });

  it("un admin ne peut pas créer de profil avec l'identité d'un non-admin", async () => {
    await expect(
      serveur("select public.creer_profil($1, gen_random_uuid(), 'x@x.test', 'admin', null)", [ids.userA]),
    ).rejects.toThrow(/acces_refuse/);
  });
});

describe("réception des mails", () => {
  it("le même n° d'intervention rattache le mail à l'affaire existante", async () => {
    const r = await creerAffaire("INT-0001", ids.prestaA, "<m3@aih.test>");
    expect(r).toEqual({ affaire_id: affaireA, resultat: "rattachee" });
    expect(await serveur("select * from public.mails_recus where affaire_id = $1", [affaireA])).toHaveLength(2);
    expect(await serveur("select * from public.affaires where numero = 'INT-0001'")).toHaveLength(1);
  });

  it("le même mail reçu deux fois n'est traité qu'une fois", async () => {
    const r = await creerAffaire("INT-0001", ids.prestaA, "<m3@aih.test>");
    expect(r.resultat).toBe("mail_deja_traite");
    expect(await serveur("select * from public.mails_recus where affaire_id = $1", [affaireA])).toHaveLength(2);
  });

  it("un même fichier n'est enregistré qu'une fois par affaire", async () => {
    const sha = "c".repeat(64);
    const appel = "select public.enregistrer_document($1, 'bon', $2, 'bon.pdf', 'application/pdf', 1000, $3, null) as r";
    const [r1] = await serveur(appel, [affaireA, "affaires/a/bon/1.pdf", sha]);
    const [r2] = await serveur(appel, [affaireA, "affaires/a/bon/2.pdf", sha]);
    expect((r1.r as { resultat: string }).resultat).toBe("enregistre");
    expect((r2.r as { resultat: string }).resultat).toBe("doublon");
  });

  it("un rapport ne peut être enregistré que pour le prestataire de l'affaire", async () => {
    await expect(
      serveur("select public.enregistrer_document($1, 'rapport', 'p/r.pdf', 'r.pdf', 'application/pdf', 10, $2, $3)", [affaireA, "d".repeat(64), ids.userB]),
    ).rejects.toThrow(/acces_refuse/);
  });
});

describe("journal et purge", () => {
  it("le journal ne peut être ni modifié ni supprimé, même par le serveur", async () => {
    await expect(serveur("update public.journal set action = 'x'")).rejects.toThrow(/permission denied/);
    await expect(serveur("delete from public.journal")).rejects.toThrow(/permission denied/);
    await expect(db.query("update public.journal set action = 'x'")).rejects.toThrow(/journal_immuable/);
  });

  it("purge les affaires terminées au-delà de la durée de conservation, en gardant la trace", async () => {
    await presta(ids.userB, "select public.changer_statut($1, 'termine')", [affaireB]);
    await db.query("update public.affaires set termine_le = now() - interval '400 days' where id = $1", [affaireB]);

    const aPurger = await serveur("select o_affaire, o_chemins from public.affaires_a_purger()");
    expect(aPurger).toEqual([{ o_affaire: affaireB, o_chemins: ["affaires/x/bon/1.pdf"] }]);

    const [{ n }] = await serveur("select public.supprimer_affaires_purgees($1) as n", [[affaireB, affaireA]]);
    expect(n).toBe(1);
    expect(await serveur("select * from public.affaires where id = $1", [affaireB])).toHaveLength(0);
    expect(await serveur("select * from public.notes where affaire_id = $1", [affaireB])).toHaveLength(0);

    const [trace] = await q("authenticated", ids.admin, "select numero, details from public.journal where action = 'affaire_purgee'");
    expect(trace).toEqual({ numero: "INT-0002", details: {} });
  });

  it("purge le journal au-delà de sa durée de conservation", async () => {
    await db.query("alter table public.journal disable trigger journal_immuable");
    await db.query("update public.journal set le = now() - interval '400 days' where action = 'affaire_creee'");
    await db.query("alter table public.journal enable trigger journal_immuable");
    const [{ n }] = await serveur("select public.purger_journal() as n");
    expect(n).toBe(2);
    expect(await serveur("select * from public.journal where action = 'affaire_creee'")).toHaveLength(0);
  });
});
