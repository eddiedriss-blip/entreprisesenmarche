# Mode d'emploi — tester tout le parcours

Toutes les données utilisées ici sont **fictives** (domaines `.test`, locataires inventés).

## 1. Installation (une seule fois)

### Prérequis
- **Node.js 22 ou plus récent** (la lecture des PDF l'exige). Vérifier avec `node -v`.
  - Si la machine a une version plus ancienne, installer la version LTS depuis nodejs.org,
    ou lancer l'appli avec `./start-dev.sh`, qui télécharge et utilise Node 22 automatiquement.
- Un compte **Supabase** gratuit (supabase.com).

### Créer le projet Supabase
1. *New project* → **Region : Europe** (Paris `eu-west-3` ou Francfort `eu-central-1`).
2. *SQL Editor* → coller tout le contenu de `supabase/migrations/20261018000001_schema.sql` → *Run*.
   Cela crée les tables, les règles d'accès, le journal et le stockage privé `documents`.
3. *Authentication → Sign In / Providers* : désactiver **Allow new users to sign up**
   (seuls les comptes créés par un admin pourront se connecter).
4. *Authentication → URL Configuration* :
   - Site URL : `http://localhost:3200`
   - Redirect URLs : ajouter `http://localhost:3200/auth/confirm`
5. *Authentication → Emails → Magic Link* : remplacer le lien du modèle par :
   ```html
   <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Se connecter</a>
   ```
   (Le lien ouvre une page avec un bouton « Me connecter ». Les antivirus de messagerie
   qui « cliquent » sur les liens ne peuvent donc pas utiliser le lien à la place de l'utilisateur.)

### Configurer l'appli
```bash
cp .env.example .env.local
```
Remplir `.env.local` :
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` :
  *Project Settings → API Keys* de Supabase.
- `APP_URL=http://localhost:3200`
- `INBOUND_SECRET` et `CRON_SECRET` : deux valeurs différentes générées avec `openssl rand -hex 32`.
- `DOMAINES_EXPEDITEURS_AUTORISES=aih.test` pour les tests. En production, ce sera le vrai domaine d'AIH.

```bash
npm install
npm run seed          # crée 2 prestataires fictifs et 4 comptes
./start-dev.sh        # ou : npm run dev -- -p 3200 (avec Node 22)
```

Comptes créés par `npm run seed` :

| Compte | Rôle |
|---|---|
| `plombier@plomberie-fictive.test` | Prestataire « Plomberie Fictive » |
| `electricien@elec-fictive.test` | Prestataire « Électricité Fictive » |
| `lecture@aih.test` | AIH, lecture seule |
| `admin@aih.test` | AIH, administrateur |

Ces adresses ne reçoivent pas de mail. Pour se connecter, générer un lien à usage unique :
```bash
npm run lien -- plombier@plomberie-fictive.test
```
Ouvrir le lien affiché, puis cliquer sur « Me connecter ». Pour tester avec un **vrai** envoi
de mail, créer un compte avec ta propre adresse depuis la page Administration.

> Astuce : pour être connecté avec deux comptes en même temps, utiliser une fenêtre de
> navigation privée pour le second.

## 2. Parcours à tester

Laisser l'appli tourner et ouvrir un second terminal pour les commandes.

### A. Mail reçu → affaire créée
```bash
npm run mail -- nouveaux
```
Résultat attendu : 3 réponses `"statut": "creee"`. Deux affaires sont attribuées à la plomberie
et une à l'électricité, chacune avec son bon PDF.

### B. Le prestataire ne voit que ses affaires
1. Se connecter avec `plombier@plomberie-fictive.test` : **2 affaires** visibles (INT-…101 et …103).
2. Se connecter dans une fenêtre privée avec `lecture@aih.test`, ouvrir l'affaire INT-…102
   (électricité) et copier son adresse (`/affaires/<id>`).
3. Coller cette adresse dans la session du plombier : la page affiche **« introuvable »** (404).
4. Même chose pour le téléchargement d'un document d'une autre affaire : 404.

### C. Statut, notes et rapport (compte plombier)
1. Ouvrir INT-…101 et passer en **RDV pris** : la date est obligatoire.
2. Passer en **En attente**, motif **Autre** sans précision : refusé. Avec une précision : accepté.
3. Ajouter une note : elle apparaît, datée.
4. **Déposer le rapport** : un PDF, puis une ou plusieurs photos (JPEG/PNG).
   - Un fichier de plus de 10 Mo est refusé.
   - Un fichier texte renommé en `.pdf` est refusé (le vrai contenu est contrôlé).
5. Dans la liste : filtrer par statut et par secteur, changer le tri.

### D. Pas de doublon
```bash
npm run mail -- relance    # même n° d'intervention → "rattachee", toujours 1 seule affaire
npm run mail -- doublon    # même mail envoyé 2 fois → le 2e est "mail_deja_traite"
```

### E. Mails ignorés
```bash
npm run mail -- pirate     # expéditeur hors AIH
npm run mail -- inconnu    # destinataire principal inconnu
npm run mail -- sans-bon   # pas de pièce jointe
npm run mail -- faux-pdf   # pièce jointe qui n'est pas un PDF
```
Chaque mail est ignoré (`"statut": "rejete"`) et apparaît dans **Administration → Mails ignorés**,
sans aucun contenu.

### F. Consultation AIH (compte `lecture@aih.test`)
1. Toutes les affaires sont visibles. Filtrer par prestataire et par statut.
2. Ouvrir une affaire : télécharger le bon et le rapport. Le lien de téléchargement expire après 5 minutes.
3. Aucun formulaire de modification n'apparaît.
4. **Mise en avant des affaires sans mise à jour depuis 7 jours** : simuler l'ancienneté dans
   le *SQL Editor* de Supabase :
   ```sql
   update affaires set derniere_maj_le = now() - interval '8 days' where numero = 'INT-2026-000102';
   ```
   La liste affiche un bandeau orange et l'affaire est marquée « +7 j sans nouvelles ».

### G. Administration (compte `admin@aih.test`)
- **Journal** : connexions, consultations, téléchargements, changements de statut, notes, dépôts.
- **Prestataires** : ajouter un prestataire et ses adresses de réception.
- **Comptes** : créer ou désactiver un compte. Un compte désactivé ne voit plus rien,
  même s'il est encore connecté.
- **Conservation** : durées en jours (365 par défaut).

### H. Purge automatique
Dans le *SQL Editor*, vieillir une affaire terminée :
```sql
update affaires set statut = 'termine', termine_le = now() - interval '400 days',
  rdv_le = null, attente_motif = null, attente_precision = null
where numero = 'INT-2026-000103';
```
Puis lancer la purge (en production, Vercel la lance chaque nuit) :
```bash
curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3200/api/cron/purge
```
L'affaire, ses notes et ses fichiers sont supprimés. Le journal garde la ligne « affaire_purgee »
avec le n° d'intervention, sans le nom du locataire.

## 3. Tests automatiques
```bash
npm test
```
48 tests, dont 24 sur les droits dans la base (Postgres réel lancé localement, sans Docker).
Ils vérifient notamment le cloisonnement entre prestataires, la lecture seule AIH, l'impossibilité
de modifier le journal et la purge.

## 4. Ce qui reste à brancher
- **Lecture du vrai bon** : `src/lib/bon/lecture.ts` lit pour l'instant le format des bons fictifs.
  Avec un exemple de vrai bon anonymisé, seule la fonction `analyserTexteBon()` sera à adapter.
- **Service de réception des mails** : l'appli attend le format décrit dans `src/lib/mail/schema.ts`
  sur `POST /api/mails/entrants` (en-tête `Authorization: Bearer <INBOUND_SECRET>`). Un petit
  adaptateur traduira le format du service choisi (Brevo, Mailgun UE…). Sur Vercel, une requête
  est limitée à 4,5 Mo : l'adaptateur devra télécharger les pièces jointes auprès du service
  plutôt que de les recevoir dans la requête.
- **Hébergement définitif** (Vercel + Supabase envisagés) et **domaine**.
