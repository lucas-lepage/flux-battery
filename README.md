# FLUX — Parcours par rôle et ajout par QR

Cette version utilise une vraie base Neo4j. Les données et l'historique sont enregistrés dans Aura. Les cinq anciens exemples BP-001 à BP-005 sont retirés une seule fois au démarrage (vérification du numéro de série initial). Les nouveaux passeports commencent par le scan du mécanicien. Aucun Docker ni logiciel à installer sur les postes utilisateurs.

## Mettre à jour le site Render existant

1. Décompresser le ZIP.
2. Dans le dépôt GitHub `flux-battery`, aller à la racine puis **Add file > Upload files**.
3. Envoyer le contenu du dossier décompressé, en conservant les dossiers `dist`, `docs`, `tools` et `tests`. Les fichiers portant le même nom remplacent les versions existantes. Ne pas envoyer le ZIP.
4. Attendre la fin de tous les transferts puis faire **Commit changes**.
5. Render redéploie. Sinon : **Manual Deploy > Deploy latest commit**.
6. Au démarrage, les référentiels et les anciennes demandes sont complétés automatiquement. Aucune réinitialisation de la base n'est nécessaire.

Variables Render conservées : NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD, NEO4J_DATABASE, HOST=0.0.0.0, COOKIE_SECURE=true et NODE_VERSION=22.

Trois mots de passe différents, de 12 caractères minimum :

| Variable | Compte |
| --- | --- |
| MECHANIC_PASSWORD | mechanic |
| OWNER_PASSWORD | owner |
| RECYCLER_PASSWORD | recycler |

APP_PASSWORD n'est plus utilisé. Ne jamais envoyer les identifiants Aura dans GitHub.

## Imprimer les QR codes

Ouvrir **`dist/imprimer-qrcodes.html`** sur le PC, ou **`/imprimer-qrcodes.html`** sur le site mis à jour. Cliquer sur Imprimer. La page est autonome : les QR sont inclus dans le fichier.

Cinq exemples sont fournis : BP-SCAN-001 à BP-SCAN-005. Ils ont des identifiants et numéros de série distincts des anciennes batteries BP-001 à BP-005. Chaque QR contient les données exactes de son passeport d'exemple, avec les cinq modules. Le fichier `dist/qr-passports.json` contient ces mêmes données en clair. Les PNG et SVG individuels figurent dans `dist/qrcodes`.

Pour produire des codes à partir de vos propres données, conserver le format de `dist/qr-passports.json` puis régénérer avec `node tools/generate-qr-cards.cjs` sur une machine de développement ou dans un environnement cloud disposant de Node. Les valeurs ne doivent pas être inventées pour de vraies batteries. Les cinq codes livrés sont explicitement des exemples pédagogiques.

## Mécanicien — scan, diagnostic et signalement

1. Se connecter avec mechanic.
2. Cliquer sur Scanner un QR code. Autoriser la caméra, ou choisir Lire une photo. Une saisie du contenu du QR est également disponible comme solution de secours.
3. Vérifier les informations décodées puis cliquer Ajouter ce passeport.
4. Neo4j crée le passeport au statut Original et ses cinq modules. Les doublons d'identifiant ou de numéro de série sont détectés.
5. Sur la fiche : identification, statut, SOH et historique en lecture seule.
6. Saisir uniquement le diagnostic / motif puis cliquer Signaler hors d'usage.
7. Une demande PENDING apparaît pour le responsable. Le statut reste Original et les mesures ne changent pas.

Aucune recommandation, aucun score et aucun menu de décision dans cet espace.

## Responsable — demandes, validation ou refus

1. Se connecter avec owner. L'espace s'ouvre sur Demandes reçues.
2. Examiner la demande du garage et son motif.
3. Choisir un centre agréé dans le référentiel puis valider : Neo4j passe le statut à Waste et enregistre la destination dans la même opération.
4. Ou refuser avec un motif : le statut reste Original. Le mécanicien peut apporter des précisions et envoyer un nouveau signalement.
5. Le suivi reste disponible. Aucune recommandation ou inspection détaillée de recyclage n'est transmise à ce rôle.

Les centres livrés sont fictifs et servent à démontrer la vérification d'agrément. Le serveur refuse un centre marqué non agréé, même si une requête est envoyée manuellement.

## Recycleur — réception, inspection puis décision

1. Se connecter avec recycler et scanner le code d'une batterie déjà enregistrée.
2. Le statut affiché vient de Neo4j : Original bloque la réception avec un message rouge. Waste permet la confirmation quand une destination agréée est enregistrée.
3. Après réception : chimie, âge, cycles et SOH préremplis en lecture seule. Le technicien renseigne les modules sains, les défauts et les constats visuels.
4. L'inspection est un objet distinct du passeport. Elle ne réécrit pas les informations initiales imprimées.
5. Après enregistrement de l'inspection seulement : quatre orientations, scores, pondérations et explications.
6. Choisir une orientation admissible et justifier la décision. Neo4j conserve les résultats, les données de l'inspection et les paramètres du calcul.

Le menu Défi 03 · Conseils est visible dans l’espace recycleur. Avant l’inspection, il explique les étapes manquantes. Après l’inspection, les quatre scores et les explications sont disponibles. Le serveur bloque aussi le calcul et la validation prématurés. Les réponses destinées au mécanicien et au responsable ne contiennent ni scores ni recommandation. Ils voient seulement que l'étape du centre de tri est terminée.

## Changer de compte et garder le suivi

Utiliser le sélecteur en haut à droite, puis saisir le mot de passe du compte choisi. La batterie sélectionnée reste la même. La page s'adapte au rôle. L'historique reste accessible pour les trois acteurs.

## QR et statut vivant

Les nouveaux QR utilisent le format compact `FLUX2:` : les noms de champs répétés et les identifiants de modules déductibles sont retirés, puis reconstruits au scan. Les cinq exemples passent de 763–782 octets à 203–227 octets, sans perte de valeurs. Les anciens QR JSON `FLUX-PASSPORT`, version 1, restent acceptés. Il contient identité, fabricant, responsable, chimie, capacité, âge, cycles, SOH, résistances, défaut initial et cinq modules. Pas de mot de passe ni de lien de connexion.

Un QR imprimé représente les informations à l'émission. Après le premier ajout, un nouveau scan ouvre la fiche existante et utilise le statut vivant de Neo4j. Le QR ne remet donc jamais une batterie Waste à Original. Les anciens QR contenant uniquement une URL de fiche sont encore utilisables pour ouvrir un passeport déjà présent, mais pas pour créer un nouveau passeport.

La création est réservée au mécanicien et nécessite confirmation après aperçu. Le JSON est validé côté serveur. Les identifiants de modules sont reconstruits à partir du passeport afin d'éviter de modifier les modules d'une autre batterie. Ce PoC ne vérifie pas de signature électronique du fabricant.

## Migration

Les passeports sont conservés, sauf les cinq anciens exemples identifiés par BP-001 à BP-005 et leur numéro de série initial. Leur suppression est définitive et ne se rejoue pas après le premier démarrage mis à jour. Les nouveaux exemples BP-SCAN-001 à BP-SCAN-005 restent disponibles comme QR à imprimer et ne sont jamais ajoutés automatiquement. Une ancienne demande au stade diagnostic devient une demande en attente. Les anciennes inspections et décisions restent consultables. Les nouveaux référentiels n'écrasent pas les données existantes. Sur une base vide, aucun passeport n'est créé automatiquement : la première batterie arrive par scan.

L'ancien IMPORT_AURA.cypher n'est pas nécessaire pour cette version. Ne pas réinitialiser ou supprimer la base pour appliquer la mise à jour.

## Tests

- `npm test` : règles de rôle et format QR.
- `node tests/roles-neo4j.cjs` : intégration sur une base Neo4j de test vide dédiée. Ce test crée et supprime des données et fait évoluer les statuts ; ne pas l'exécuter sur la base de démonstration réelle.
- Les cinq PNG compacts ont été lus dans le navigateur avec le décodeur livré. La lecture d’une photo depuis le vrai formulaire a été contrôlée avec un serveur de test simulé.
- Le parcours a été contrôlé dans le navigateur. La caméra physique devra être essayée sur votre tablette ou téléphone ; la fonction photo et le repli texte évitent de dépendre d'une caméra sur PC.

## Limites

Les mots de passe des comptes sont des secrets Render, distincts des accès Aura. Les sessions expirent au bout de huit heures et après redémarrage du serveur. La classification, les seuils et les notes restent pédagogiques et ne certifient pas l'aptitude réelle d'une batterie. Les données d'exemple ne décrivent pas de vraies batteries.

## Sources techniques

- https://neo4j.com/docs/javascript-manual/current/
- https://scanapp.org/html5-qrcode-docs/docs/apis/classes/Html5Qrcode
- https://render.com/docs/web-services

## Suppression depuis l’application

Compte Responsable → ouvrir le passeport → Gestion du passeport → Supprimer la batterie. Recopier l’identifiant exact puis confirmer. L’opération supprime définitivement le passeport, ses modules et son historique dans Neo4j. Les acteurs, centres de tri, demandes du marché et les autres batteries sont conservés. Le serveur vérifie le rôle, la confirmation et la révision avant toute suppression.

## Nouvelle interface et lecteur

Interface bleu nuit et blanc, navigation métier, boutons prioritaires plus visibles et dispositions adaptées aux écrans étroits. Le bloc QR redondant de la fiche a été retiré. Les QR sont uniquement dans la page d’impression et ses fichiers associés.

Le scan caméra utilise le cadre complet et privilégie la caméra arrière, avec repli sur les caméras disponibles. La lecture des images utilise jsQR à la résolution d’origine, puis html5-qrcode et le décodeur natif du navigateur en secours. Les décodeurs sont livrés avec le site. Les photos sont traitées sur l’appareil, sans envoi d’image au serveur. Le lien HTTPS et l’autorisation caméra restent nécessaires pour une prise de vue en direct.
