# Suivi des interventions prestataires

Application web de suivi des interventions confiées aux prestataires. Une affaire est créée
automatiquement à la réception d'un mail de demande d'intervention.

- **Tester le parcours complet** : [docs/MODE-EMPLOI.md](docs/MODE-EMPLOI.md)
- **Fiche données / hébergement / accès / conservation** : [docs/FICHE-DSI.md](docs/FICHE-DSI.md)

## Stack
Next.js 16 · Supabase (PostgreSQL, Auth par lien magique, Storage privé) · Node 22+

## Organisation
| Emplacement | Rôle |
|---|---|
| `supabase/migrations/` | Schéma, règles d'accès (RLS), fonctions, journal, purge |
| `src/lib/mail/` | Réception des mails (contrôles, attribution, dédoublonnage) |
| `src/lib/bon/lecture.ts` | Lecture du bon PDF (**format provisoire**) |
| `src/lib/fichiers.ts` | Validation des fichiers (vrai type, taille) |
| `src/app/` | Pages (liste, affaire, administration, connexion) et API |
| `scripts/` | Données fictives, simulation de mails, liens de connexion de test |
| `test/sql/` | Tests des droits sur un vrai PostgreSQL |

```bash
npm test        # tests unitaires et tests de droits
```
