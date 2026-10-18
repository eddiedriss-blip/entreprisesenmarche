# Fiche technique — Suivi des interventions prestataires

*Version de test — octobre 2026. Les points marqués **[à valider]** attendent l'avis du service informatique.*

**Objet.** Application web qui suit l'avancement des interventions confiées aux prestataires
(plombier, électricien…). Elle complète le logiciel interne, ne fait **aucune facturation**
et n'échange **rien** avec ce logiciel. Elle est alimentée par les mails de demande d'intervention,
avec l'adresse de l'appli en copie.

## Données traitées (minimisation)
| Donnée | Origine | Remarque |
|---|---|---|
| N° d'intervention, nom du locataire, adresse, secteur | Bon PDF joint au mail | Seuls ces champs sont extraits |
| Bon d'intervention (PDF) | Pièce jointe du mail | Stockage privé |
| Statut, date de RDV, motif d'attente | Saisi par le prestataire | |
| Notes datées | Saisies par le prestataire | Ne peuvent être ni modifiées ni supprimées |
| Rapport d'intervention (PDF / photos) | Déposé par le prestataire | 10 Mo max par fichier |
| Comptes : adresse mail, rôle | Créés par un admin AIH | Pas de mot de passe |
| Journal : qui, quoi, quand | Automatique | Ne contient pas le nom du locataire |

**Le corps des mails n'est jamais stocké.** Pour chaque mail, l'appli garde seulement le Message-ID,
l'expéditeur, le destinataire et la date. Un mail ignoré ne laisse qu'une trace technique :
motif, domaine expéditeur et empreinte du Message-ID.

## Hébergement **[à valider]**
- **Base de données et fichiers** : Supabase (PostgreSQL managé et stockage objet), région **UE**
  (Paris ou Francfort). Chiffrement au repos et en transit (TLS).
- **Application** : Vercel, fonctions exécutées en région **Paris (cdg1)**.
- **Réception des mails** : service à choisir, de préférence européen (par ex. Brevo, société
  française). Nécessite un sous-domaine dédié avec un enregistrement MX, à créer par le service informatique.
- Supabase et Vercel sont des sociétés de droit américain : contrats de sous-traitance (DPA)
  et clauses contractuelles types à vérifier. Si une solution 100 % européenne est exigée
  (Scaleway, OVH…), l'architecture reste transposable.
- **Aucun secret dans le code** : les clés sont fournies par variables d'environnement.

## Accès et sécurité
- **Comptes individuels**, créés uniquement par un administrateur AIH. Connexion par
  **lien magique** envoyé par mail, valable 1 heure et à usage unique (pas de mot de passe).
- **Trois rôles** :
  - **Prestataire** : ne voit et ne modifie que ses affaires.
  - **AIH lecture** : voit toutes les affaires, sans rien modifier.
  - **AIH admin** : comptes, prestataires, durées de conservation, journal.
- **Contrôle des droits dans la base** (Row Level Security PostgreSQL) et revérifié par le
  serveur. Changer un identifiant dans l'URL ne donne accès à rien. Aucune écriture directe sur
  les tables : toute modification passe par une fonction qui contrôle les droits et journalise.
  Ces règles sont couvertes par des tests automatiques.
- **Fichiers privés** : téléchargement uniquement par lien signé valable **5 minutes**, créé
  après contrôle des droits.
- **Fichiers contrôlés** : le vrai type est vérifié d'après le contenu (PDF, JPEG, PNG, WebP),
  pas d'après le nom. 10 Mo maximum.
- **Mails filtrés** : un mail est ignoré si l'expéditeur n'est pas d'un domaine AIH authentifié
  (SPF/DKIM), si le destinataire principal n'est pas un prestataire connu, ou s'il n'y a pas
  de bon PDF lisible.
- **Journal** des connexions, consultations, téléchargements et modifications. Il ne peut être
  ni modifié ni supprimé, y compris par l'application. Seuls les admins le consultent.
- En-têtes de sécurité HTTP (anti-iframe, pas de fuite d'URL via Referer, HSTS) ; pages non indexées.

## Conservation et purge automatique
| Donnée | Durée | Mécanisme |
|---|---|---|
| Affaire terminée, avec bon, rapport et notes | **12 mois** après « Terminé » (paramétrable) | Purge chaque nuit |
| Journal et traces des mails ignorés | **12 mois** (paramétrable) | Purge chaque nuit |
| Affaire non terminée | Tant qu'elle est en cours | — |

Après la purge, le journal ne garde que le n° d'intervention et la date de suppression.
**[à valider]** Les sauvegardes automatiques de Supabase peuvent conserver des données
supprimées quelques jours, selon l'offre souscrite.

## Points à valider par le service informatique
1. Hébergeurs (Supabase/Vercel) ou alternative 100 % européenne.
2. Service de réception des mails et création du sous-domaine (MX, SPF, DKIM).
3. Domaine(s) expéditeur(s) AIH autorisé(s).
4. Durées de conservation (12 mois proposés).
5. Inscription au registre des traitements RGPD et information des locataires.
