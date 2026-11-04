# FLUX — Déploiement AuraDB + Render sans installation

Cette version exige une véritable base Neo4j. Aucune donnée de secours dans le navigateur et aucun Docker ne sont nécessaires. Tout se configure dans votre navigateur. Le serveur s'arrête au démarrage si Neo4j n'est pas joignable.

## 1. Remplir la base Aura (facultatif avant Render)

Dans AuraDB > FLUX-Battery > Connect > Query, connectez-vous avec l'utilisateur neo4j et le mot de passe téléchargé lors de la création.

Ouvrez `IMPORT_AURA.cypher` dans le Bloc-notes, copiez tout puis collez dans l'éditeur Query. Exécutez le script. Le résultat attendu est : 5 batteries, 25 modules, 4 demandes et 5 événements vérifiés. Une réexécution ne remet pas à zéro les batteries déjà modifiées.

Le serveur peut aussi effectuer automatiquement cet import au premier déploiement. Il crée en plus les contraintes d'unicité. Le script manuel permet de vérifier dès maintenant le contenu de la base.

## 2. Déposer le code sur GitHub

1. Extraire le ZIP.
2. Créer un dépôt GitHub, par exemple `flux-battery`.
3. Choisir **Add file > Upload files**.
4. Glisser le contenu du dossier extrait dans la zone d'import, y compris les dossiers `dist`, `docs` et `tests`.
5. Vérifier que `package.json`, `package-lock.json`, `server.cjs`, `start.cjs`, `db.cjs`, `seed.cjs`, `workflow.cjs` et `render.yaml` apparaissent directement à la racine du dépôt.
6. Valider avec **Commit changes**.

Aucun fichier d'identifiants Aura ne doit être ajouté au dépôt.

## 3. Créer un Web Service Render

Dans https://dashboard.render.com/ : **New > Web Service**, connecter le dépôt GitHub, puis choisir les valeurs suivantes :

| Réglage | Valeur |
| --- | --- |
| Language / Runtime | Node |
| Branch | main |
| Root Directory | Laisser vide si package.json est à la racine |
| Build Command | `npm ci` |
| Start Command | `npm start` |
| Instance Type | Free |

Configurer les variables suivantes dans **Environment** :

| Variable | Valeur |
| --- | --- |
| NEO4J_URI | Connection URI du fichier Aura, commence par `neo4j+s://` |
| NEO4J_USERNAME | `neo4j` |
| NEO4J_PASSWORD | Mot de passe téléchargé lors de la création Aura |
| NEO4J_DATABASE | `neo4j` |
| APP_PASSWORD | Mot de passe choisi pour les trois comptes de démonstration, au moins 12 caractères |
| HOST | `0.0.0.0` |
| COOKIE_SECURE | `true` |
| NODE_VERSION | `22` |

Render fournit automatiquement PORT. Ne pas recopier le mot de passe Aura dans APP_PASSWORD : ce sont deux accès distincts.

Lancer **Deploy Web Service**. Quand les journaux affichent « FLUX connecté à Neo4j », ouvrir l'URL que Render fournit. Son nom exact dépend de la disponibilité sur Render. Le fichier `render.yaml` peut également servir pour un déploiement Blueprint.

## 4. Démonstration

Comptes : `mechanic`, `owner` et `recycler`, tous avec le mot de passe APP_PASSWORD choisi dans Render.

1. Compte mechanic : choisir BP-003 puis transmettre le diagnostic.
2. Guide de démo > Changer de compte, puis se connecter avec owner.
3. Valider Original > Waste puis enregistrer le transfert.
4. Se connecter avec recycler, confirmer la réception puis enregistrer l'inspection.
5. Ouvrir l'aide à la décision, comparer les quatre orientations, changer les poids si nécessaire.
6. Justifier et valider une orientation admissible. BP-003 recommande initialement Repurpose.
7. Consulter la traçabilité et vérifier les nœuds Decision dans Aura.

Les QR codes sont générés par le serveur avec l'adresse actuelle du site Render. Ils n'ouvrent pas le site ChatGPT.

## 5. Afficher le graphe dans Aura

```cypher
MATCH (b:Battery)-[r]->(n) RETURN b,r,n;
```

Après validation d'une décision :

```cypher
MATCH (b:Battery)-[:HAS_DECISION]->(d:Decision)
RETURN b.id,d.orientation,d.justification;
```

## 6. Contenu et limites

Cas principal + défi 3 : trois rôles, cinq batteries avec cinq modules, quatre demandes du marché et quatre orientations. Les règles et pondérations sont décrites dans `docs/decision.md`. Les scores économiques et environnementaux sont des hypothèses pédagogiques, sans certification industrielle. Le centre de tri doit valider la décision.

Neo4j conserve toutes les données, même si Render redémarre. Les sessions sont en mémoire et demandent une reconnexion après redémarrage. Les trois comptes partagent un mot de passe uniquement pour la démonstration. Une application de production nécessiterait des comptes individuels et une gestion des autorisations sur les passeports.

Sur Render Free, le service se met en veille après 15 minutes sans visite. Une visite déclenche son réveil, qui peut prendre environ une minute. AuraDB Free se met automatiquement en pause après 72 heures sans activité. Il faut la reprendre depuis Aura avant la démonstration. Une instance Aura Free laissée en pause plus de 30 jours peut être supprimée. Conserver vos exports.

Les diapositives PowerPoint et leur version HTML figurent dans dist. Le script d'import est aussi exécuté automatiquement au démarrage sans écraser les passeports existants.

## Développement et vérifications

Les utilisateurs finaux n'ont rien à installer. Pour les développeurs disposant d'un environnement Node : `npm ci`, `npm test`, puis configurer les variables et `npm start`.

`tests/neo4j-integration.cjs` cible exclusivement une base de test vide et fait avancer BP-003. Ne pas l'exécuter sur la base de démonstration déjà utilisée.

## Sources techniques

- https://neo4j.com/docs/javascript-manual/current/connect/
- https://neo4j.com/docs/javascript-manual/current/transactions/
- https://render.com/docs/free
- https://render.com/docs/blueprint-spec
- https://neo4j.com/docs/aura/managing-instances/instance-actions/
