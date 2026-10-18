-- Suivi des interventions prestataires — schéma initial.
--
-- Principe de sécurité : tout est verrouillé dans la base.
--  * Lecture : RLS sur chaque table, un prestataire ne voit que ses affaires.
--  * Écriture : aucune écriture directe sur les tables depuis l'appli.
--    Toutes les modifications passent par des fonctions qui vérifient les droits
--    et écrivent dans le journal.
--  * Le journal ne peut être ni modifié ni supprimé (sauf purge de rétention).

-- ───────────────────────────── Types ─────────────────────────────

create type public.role_utilisateur as enum ('prestataire', 'aih_lecture', 'admin');
create type public.statut_affaire as enum (
  'nouvelle', 'client_appele', 'rdv_pris', 'en_attente', 'intervenu', 'termine'
);
create type public.motif_attente as enum ('piece', 'devis', 'acces', 'autre');
create type public.type_document as enum ('bon', 'rapport');

-- ───────────────────────────── Tables ─────────────────────────────

create table public.prestataires (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique check (length(btrim(nom)) between 1 and 120),
  actif boolean not null default true,
  cree_le timestamptz not null default now()
);

-- Adresses mail d'un prestataire : sert à attribuer une affaire selon le
-- destinataire principal du mail reçu.
create table public.prestataire_adresses (
  email text primary key check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  prestataire_id uuid not null references public.prestataires (id) on delete cascade
);

create table public.profils (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique check (email = lower(email)),
  role public.role_utilisateur not null,
  prestataire_id uuid references public.prestataires (id) on delete restrict,
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  constraint profil_role_coherent check ((role = 'prestataire') = (prestataire_id is not null))
);

create table public.affaires (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique check (numero ~ '^[A-Za-z0-9/_-]{1,40}$'),
  locataire_nom text not null check (length(btrim(locataire_nom)) between 1 and 200),
  adresse text not null check (length(btrim(adresse)) between 1 and 300),
  secteur text check (length(secteur) <= 80),
  prestataire_id uuid not null references public.prestataires (id) on delete restrict,
  statut public.statut_affaire not null default 'nouvelle',
  rdv_le timestamptz,
  attente_motif public.motif_attente,
  attente_precision text check (length(attente_precision) <= 300),
  cree_le timestamptz not null default now(),
  derniere_maj_le timestamptz not null default now(),
  termine_le timestamptz,
  constraint affaire_rdv check (statut <> 'rdv_pris' or rdv_le is not null),
  constraint affaire_attente check ((statut = 'en_attente') = (attente_motif is not null)),
  constraint affaire_precision check (
    attente_motif is distinct from 'autre' or length(btrim(coalesce(attente_precision, ''))) > 0
  ),
  constraint affaire_termine check ((statut = 'termine') = (termine_le is not null))
);
create index affaires_prestataire_idx on public.affaires (prestataire_id);
create index affaires_statut_idx on public.affaires (statut);

-- Trace des mails reçus (jamais le corps du mail). Le Message-ID unique
-- empêche de traiter deux fois le même mail.
create table public.mails_recus (
  id uuid primary key default gen_random_uuid(),
  affaire_id uuid not null references public.affaires (id) on delete cascade,
  message_id text not null unique check (length(message_id) <= 300),
  expediteur text not null,
  destinataire text not null,
  recu_le timestamptz not null default now()
);
create index mails_recus_affaire_idx on public.mails_recus (affaire_id);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  affaire_id uuid not null references public.affaires (id) on delete cascade,
  type public.type_document not null,
  chemin text not null unique,
  nom_fichier text not null check (length(nom_fichier) between 1 and 200),
  mime text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  taille integer not null check (taille > 0 and taille <= 10485760),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  depose_par uuid references public.profils (id) on delete set null,
  depose_le timestamptz not null default now(),
  unique (affaire_id, sha256)
);
create index documents_affaire_idx on public.documents (affaire_id);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  affaire_id uuid not null references public.affaires (id) on delete cascade,
  auteur_id uuid references public.profils (id) on delete set null,
  texte text not null check (length(btrim(texte)) between 1 and 2000),
  cree_le timestamptz not null default now()
);
create index notes_affaire_idx on public.notes (affaire_id);

-- Journal des accès et des modifications. Pas de clé étrangère vers affaires :
-- la trace survit à la purge (sans le nom du locataire).
create table public.journal (
  id bigint generated always as identity primary key,
  le timestamptz not null default now(),
  acteur_id uuid,
  acteur_email text,
  action text not null,
  affaire_id uuid,
  numero text,
  details jsonb not null default '{}'
);
create index journal_le_idx on public.journal (le);
create index journal_affaire_idx on public.journal (affaire_id);

-- Mails ignorés : uniquement la date, le motif, le domaine expéditeur et une
-- empreinte du Message-ID. Aucun contenu.
create table public.mails_rejetes (
  id bigint generated always as identity primary key,
  le timestamptz not null default now(),
  motif text not null,
  domaine_expediteur text,
  message_id_empreinte text
);

create table public.parametres (
  id boolean primary key default true check (id),
  duree_conservation_jours integer not null default 365 check (duree_conservation_jours between 30 and 3650),
  duree_journal_jours integer not null default 365 check (duree_journal_jours between 30 and 3650)
);
insert into public.parametres default values;

-- ───────────────────── Vue liste (droits de l'appelant) ─────────────────────

create view public.affaires_vue with (security_invoker = true) as
select
  a.id, a.numero, a.locataire_nom, a.adresse, a.secteur,
  a.prestataire_id, p.nom as prestataire_nom,
  a.statut, a.rdv_le, a.attente_motif, a.attente_precision,
  a.cree_le, a.derniere_maj_le, a.termine_le,
  (a.statut <> 'termine' and a.derniere_maj_le < now() - interval '7 days') as sans_maj_7j
from public.affaires a
join public.prestataires p on p.id = a.prestataire_id;

-- ───────────────────── Qui est connecté ? ─────────────────────

create function public.role_courant()
returns public.role_utilisateur
language sql stable security definer set search_path = ''
as $$
  select p.role from public.profils p where p.id = auth.uid() and p.actif
$$;

-- Prestataire du compte connecté (null si le compte ou le prestataire est désactivé).
create function public.prestataire_courant()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select p.prestataire_id
  from public.profils p
  join public.prestataires pr on pr.id = p.prestataire_id and pr.actif
  where p.id = auth.uid() and p.actif and p.role = 'prestataire'
$$;

create function public.est_aih()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.role_courant() in ('aih_lecture', 'admin'), false)
$$;

create function public.est_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.role_courant() = 'admin', false)
$$;

-- ───────────────────────────── RLS ─────────────────────────────

alter table public.prestataires enable row level security;
alter table public.prestataire_adresses enable row level security;
alter table public.profils enable row level security;
alter table public.affaires enable row level security;
alter table public.mails_recus enable row level security;
alter table public.documents enable row level security;
alter table public.notes enable row level security;
alter table public.journal enable row level security;
alter table public.mails_rejetes enable row level security;
alter table public.parametres enable row level security;

create policy prestataires_lecture on public.prestataires for select to authenticated
  using (public.est_aih() or id = public.prestataire_courant());

create policy adresses_lecture on public.prestataire_adresses for select to authenticated
  using (public.est_admin());

create policy profils_lecture on public.profils for select to authenticated
  using ((id = auth.uid() and actif) or public.est_admin());

create policy affaires_lecture on public.affaires for select to authenticated
  using (public.est_aih() or prestataire_id = public.prestataire_courant());

create policy mails_lecture on public.mails_recus for select to authenticated
  using (public.est_aih());

create policy documents_lecture on public.documents for select to authenticated
  using (affaire_id in (select a.id from public.affaires a));

create policy notes_lecture on public.notes for select to authenticated
  using (affaire_id in (select a.id from public.affaires a));

create policy journal_lecture on public.journal for select to authenticated
  using (public.est_admin());

create policy rejets_lecture on public.mails_rejetes for select to authenticated
  using (public.est_admin());

create policy parametres_lecture on public.parametres for select to authenticated
  using (public.est_aih());

-- Aucun accès anonyme ; aucune écriture directe pour les comptes connectés.
revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate on all tables in schema public from authenticated;
grant select on all tables in schema public to authenticated;
-- Même le serveur (service_role) ne peut pas réécrire l'histoire.
revoke update, delete, truncate on public.journal from authenticated, service_role;

create function public.journal_immuable()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and current_setting('app.purge_journal', true) = 'on' then
    return old;
  end if;
  raise exception 'journal_immuable' using errcode = '42501';
end
$$;

create trigger journal_immuable
  before update or delete on public.journal
  for each row execute function public.journal_immuable();

-- ───────────────────────────── Journal ─────────────────────────────

create function public.journaliser(
  p_acteur uuid, p_action text, p_affaire uuid, p_details jsonb default '{}'
)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.journal (acteur_id, acteur_email, action, affaire_id, numero, details)
  values (
    p_acteur,
    (select email from public.profils where id = p_acteur),
    p_action,
    p_affaire,
    (select numero from public.affaires where id = p_affaire),
    coalesce(p_details, '{}')
  )
$$;

-- ─────────────────── Actions du prestataire ───────────────────

create function public.changer_statut(
  p_affaire uuid,
  p_statut public.statut_affaire,
  p_rdv_le timestamptz default null,
  p_motif public.motif_attente default null,
  p_precision text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_presta uuid := public.prestataire_courant();
  v_aff public.affaires;
  v_precision text := nullif(btrim(coalesce(p_precision, '')), '');
begin
  if v_presta is null then
    raise exception 'acces_refuse' using errcode = '42501';
  end if;
  select * into v_aff from public.affaires where id = p_affaire for update;
  if not found or v_aff.prestataire_id <> v_presta then
    raise exception 'acces_refuse' using errcode = '42501';
  end if;
  if p_statut = 'rdv_pris' and p_rdv_le is null then
    raise exception 'date_rdv_requise' using errcode = '22023';
  end if;
  if p_statut = 'en_attente' and p_motif is null then
    raise exception 'motif_requis' using errcode = '22023';
  end if;
  if p_statut = 'en_attente' and p_motif = 'autre' and v_precision is null then
    raise exception 'precision_requise' using errcode = '22023';
  end if;
  if length(v_precision) > 300 then
    raise exception 'precision_trop_longue' using errcode = '22023';
  end if;

  update public.affaires set
    statut = p_statut,
    rdv_le = case when p_statut = 'rdv_pris' then p_rdv_le else rdv_le end,
    attente_motif = case when p_statut = 'en_attente' then p_motif end,
    attente_precision = case when p_statut = 'en_attente' then v_precision end,
    termine_le = case when p_statut = 'termine' then coalesce(termine_le, now()) end,
    derniere_maj_le = now()
  where id = p_affaire;

  perform public.journaliser(auth.uid(), 'statut_modifie', p_affaire, jsonb_strip_nulls(jsonb_build_object(
    'de', v_aff.statut,
    'vers', p_statut,
    'rdv_le', case when p_statut = 'rdv_pris' then p_rdv_le end,
    'motif', case when p_statut = 'en_attente' then p_motif end
  )));
end
$$;

create function public.ajouter_note(p_affaire uuid, p_texte text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_presta uuid := public.prestataire_courant();
  v_id uuid;
  v_texte text := btrim(coalesce(p_texte, ''));
begin
  if v_presta is null or not exists (
    select 1 from public.affaires where id = p_affaire and prestataire_id = v_presta
  ) then
    raise exception 'acces_refuse' using errcode = '42501';
  end if;
  if length(v_texte) = 0 or length(v_texte) > 2000 then
    raise exception 'note_invalide' using errcode = '22023';
  end if;

  insert into public.notes (affaire_id, auteur_id, texte)
  values (p_affaire, auth.uid(), v_texte)
  returning id into v_id;
  update public.affaires set derniere_maj_le = now() where id = p_affaire;
  perform public.journaliser(auth.uid(), 'note_ajoutee', p_affaire, jsonb_build_object('note_id', v_id));
  return v_id;
end
$$;

-- ─────────────── Fonctions réservées au serveur (service_role) ───────────────

create function public.creer_ou_rattacher_affaire(
  p_numero text, p_nom text, p_adresse text, p_secteur text,
  p_prestataire uuid, p_message_id text, p_expediteur text, p_destinataire text
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_presta_existant uuid;
  v_resultat text;
begin
  select m.affaire_id into v_id from public.mails_recus m where m.message_id = p_message_id;
  if found then
    return jsonb_build_object('affaire_id', v_id, 'resultat', 'mail_deja_traite');
  end if;

  insert into public.affaires (numero, locataire_nom, adresse, secteur, prestataire_id)
  values (p_numero, btrim(p_nom), btrim(p_adresse), nullif(btrim(coalesce(p_secteur, '')), ''), p_prestataire)
  on conflict (numero) do nothing
  returning id into v_id;

  if v_id is not null then
    v_resultat := 'creee';
  else
    select id, prestataire_id into v_id, v_presta_existant from public.affaires where numero = p_numero;
    v_resultat := 'rattachee';
  end if;

  insert into public.mails_recus (affaire_id, message_id, expediteur, destinataire)
  values (v_id, p_message_id, lower(p_expediteur), lower(p_destinataire));

  perform public.journaliser(
    null,
    case v_resultat when 'creee' then 'affaire_creee' else 'mail_rattache' end,
    v_id,
    case when v_presta_existant is distinct from null and v_presta_existant <> p_prestataire
      then jsonb_build_object('prestataire_different', true) else '{}'::jsonb end
  );
  return jsonb_build_object('affaire_id', v_id, 'resultat', v_resultat);
end
$$;

create function public.enregistrer_document(
  p_affaire uuid, p_type public.type_document, p_chemin text, p_nom text,
  p_mime text, p_taille integer, p_sha256 text, p_acteur uuid
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  -- Défense en profondeur : un rapport ne peut venir que du prestataire de l'affaire.
  if p_type = 'rapport' and not exists (
    select 1
    from public.profils p
    join public.affaires a on a.prestataire_id = p.prestataire_id
    join public.prestataires pr on pr.id = p.prestataire_id and pr.actif
    where p.id = p_acteur and p.actif and a.id = p_affaire
  ) then
    raise exception 'acces_refuse' using errcode = '42501';
  end if;

  insert into public.documents (affaire_id, type, chemin, nom_fichier, mime, taille, sha256, depose_par)
  values (p_affaire, p_type, p_chemin, left(p_nom, 200), p_mime, p_taille, p_sha256, p_acteur)
  on conflict (affaire_id, sha256) do nothing
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('resultat', 'doublon');
  end if;
  if p_type = 'rapport' then
    update public.affaires set derniere_maj_le = now() where id = p_affaire;
  end if;
  perform public.journaliser(p_acteur, 'document_depose', p_affaire,
    jsonb_build_object('document_id', v_id, 'type', p_type, 'taille', p_taille));
  return jsonb_build_object('resultat', 'enregistre', 'document_id', v_id);
end
$$;

create function public.rejeter_mail(p_motif text, p_domaine text, p_empreinte text)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.mails_rejetes (motif, domaine_expediteur, message_id_empreinte)
  values (left(p_motif, 200), left(lower(p_domaine), 200), p_empreinte)
$$;

-- Affaires terminées dont la durée de conservation est dépassée, avec les
-- chemins des fichiers à supprimer du stockage.
create function public.affaires_a_purger()
returns table (o_affaire uuid, o_chemins text[])
language sql stable security definer set search_path = ''
as $$
  select a.id, coalesce(array_agg(d.chemin) filter (where d.chemin is not null), '{}')
  from public.affaires a
  left join public.documents d on d.affaire_id = a.id
  where a.statut = 'termine'
    and a.termine_le < now() - make_interval(days => (select duree_conservation_jours from public.parametres))
  group by a.id
$$;

create function public.supprimer_affaires_purgees(p_ids uuid[])
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_aff record;
  v_nb integer := 0;
begin
  for v_aff in
    select id from public.affaires
    where id = any (p_ids)
      and statut = 'termine'
      and termine_le < now() - make_interval(days => (select duree_conservation_jours from public.parametres))
    for update
  loop
    -- Journalisé avant suppression pour garder le n° d'intervention (pas le nom).
    perform public.journaliser(null, 'affaire_purgee', v_aff.id);
    delete from public.affaires where id = v_aff.id;
    v_nb := v_nb + 1;
  end loop;
  return v_nb;
end
$$;

create function public.purger_journal()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_limite timestamptz := now() - make_interval(days => (select duree_journal_jours from public.parametres));
  v_nb integer;
begin
  perform set_config('app.purge_journal', 'on', true);
  delete from public.journal where le < v_limite;
  get diagnostics v_nb = row_count;
  perform set_config('app.purge_journal', 'off', true);
  delete from public.mails_rejetes where le < v_limite;
  return v_nb;
end
$$;

create function public.creer_profil(
  p_admin uuid, p_id uuid, p_email text, p_role public.role_utilisateur, p_prestataire uuid
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.profils where id = p_admin and actif and role = 'admin') then
    raise exception 'acces_refuse' using errcode = '42501';
  end if;
  insert into public.profils (id, email, role, prestataire_id)
  values (p_id, lower(btrim(p_email)), p_role, case when p_role = 'prestataire' then p_prestataire end);
  perform public.journaliser(p_admin, 'compte_cree', null,
    jsonb_build_object('compte_id', p_id, 'role', p_role));
end
$$;

-- ─────────────────── Administration (rôle admin) ───────────────────

create function public.exiger_admin()
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.est_admin() then
    raise exception 'acces_refuse' using errcode = '42501';
  end if;
end
$$;

create function public.admin_creer_prestataire(p_nom text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  perform public.exiger_admin();
  insert into public.prestataires (nom) values (btrim(p_nom)) returning id into v_id;
  perform public.journaliser(auth.uid(), 'prestataire_cree', null, jsonb_build_object('prestataire_id', v_id));
  return v_id;
end
$$;

create function public.admin_activer_prestataire(p_id uuid, p_actif boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.exiger_admin();
  update public.prestataires set actif = p_actif where id = p_id;
  perform public.journaliser(auth.uid(), case when p_actif then 'prestataire_active' else 'prestataire_desactive' end,
    null, jsonb_build_object('prestataire_id', p_id));
end
$$;

create function public.admin_ajouter_adresse(p_prestataire uuid, p_email text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.exiger_admin();
  insert into public.prestataire_adresses (email, prestataire_id) values (lower(btrim(p_email)), p_prestataire);
  perform public.journaliser(auth.uid(), 'adresse_ajoutee', null,
    jsonb_build_object('prestataire_id', p_prestataire, 'email', lower(btrim(p_email))));
end
$$;

create function public.admin_retirer_adresse(p_email text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.exiger_admin();
  delete from public.prestataire_adresses where email = lower(btrim(p_email));
  perform public.journaliser(auth.uid(), 'adresse_retiree', null, jsonb_build_object('email', lower(btrim(p_email))));
end
$$;

create function public.admin_activer_profil(p_id uuid, p_actif boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.exiger_admin();
  if p_id = auth.uid() then
    raise exception 'impossible_sur_soi' using errcode = '22023';
  end if;
  update public.profils set actif = p_actif where id = p_id;
  perform public.journaliser(auth.uid(), case when p_actif then 'compte_active' else 'compte_desactive' end,
    null, jsonb_build_object('compte_id', p_id));
end
$$;

create function public.admin_modifier_parametres(p_conservation integer, p_journal integer)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.exiger_admin();
  update public.parametres set duree_conservation_jours = p_conservation, duree_journal_jours = p_journal;
  perform public.journaliser(auth.uid(), 'parametres_modifies', null,
    jsonb_build_object('conservation_jours', p_conservation, 'journal_jours', p_journal));
end
$$;

-- ─────────────────── Droits d'exécution des fonctions ───────────────────

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.role_courant(), public.prestataire_courant(), public.est_aih(), public.est_admin(),
  public.changer_statut(uuid, public.statut_affaire, timestamptz, public.motif_attente, text),
  public.ajouter_note(uuid, text),
  public.admin_creer_prestataire(text),
  public.admin_activer_prestataire(uuid, boolean),
  public.admin_ajouter_adresse(uuid, text),
  public.admin_retirer_adresse(text),
  public.admin_activer_profil(uuid, boolean),
  public.admin_modifier_parametres(integer, integer)
to authenticated;

grant execute on function
  public.journaliser(uuid, text, uuid, jsonb),
  public.creer_ou_rattacher_affaire(text, text, text, text, uuid, text, text, text),
  public.enregistrer_document(uuid, public.type_document, text, text, text, integer, text, uuid),
  public.rejeter_mail(text, text, text),
  public.affaires_a_purger(),
  public.supprimer_affaires_purgees(uuid[]),
  public.purger_journal(),
  public.creer_profil(uuid, uuid, text, public.role_utilisateur, uuid)
to service_role;

-- ───────────────────────────── Stockage ─────────────────────────────
-- Bucket privé, sans aucune policy : seul le serveur y accède, et les
-- utilisateurs passent par des liens signés temporaires.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
