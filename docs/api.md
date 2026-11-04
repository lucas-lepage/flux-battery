
## Parcours par rôle et scan (version actuelle)

- POST /api/passports/lookup : lire le contenu QR et consulter un passeport existant, sans mutation.
- POST /api/passports/import : ajout réservé au mécanicien, après validation du JSON QR. Réponse 201 pour un nouvel ajout, 200 si le passeport existe déjà. Aucun écrasement des données existantes.
- POST /api/batteries/:id/diagnostic : mécanicien, uniquement `note`. Crée une demande sans changer les mesures ou le statut.
- POST /api/batteries/:id/waste : responsable, `requestId` et `centerId`. Nécessite un centre agréé et une demande en attente. Statut Waste et destination dans une même transaction.
- POST /api/batteries/:id/refuse : responsable, `requestId` et `note` obligatoire. Conserve Original.
- POST /api/batteries/:id/receive : recycleur après validation de Waste et de la destination.
- POST /api/batteries/:id/inspection : recycleur après réception, `note` et cinq objets module (`healthy`, `fault`, `visual`). Les mesures initiales sont protégées.
- POST /api/batteries/:id/recommendation : recycleur seulement, après inspection. `weights` et `revision`.
- POST /api/batteries/:id/decision : recycleur après inspection. Orientation admissible et justification humaine.

GET /api/state renvoie une projection adaptée au rôle. L'historique reste disponible, mais les décisions sont résumées sans scores ni justification technique pour les autres rôles.


## Suppression (responsable uniquement)

`POST /api/batteries/:id/delete` avec `{ "revision": 0, "confirmation": "IDENTIFIANT_EXACT" }`. Réponse `{ "deleted": true, "id": "IDENTIFIANT_EXACT" }`. Rôle incorrect : 403, confirmation incorrecte : 400, révision périmée : 409. Suppression atomique des nœuds propres à la batterie ; les références partagées sont conservées. La migration `remove-initial-demo-batteries-v1` retire les cinq anciens exemples une seule fois.

Le lecteur accepte les QR compacts `FLUX2:` et les anciens JSON `FLUX-PASSPORT` v1. Les valeurs sont validées avec le même schéma. Le fichier JSON des exemples garde son format lisible ; seul le contenu encodé dans les images est compacté.

Après validation de la décision, `Battery.status` et le payload passent à `Oriented` (affichage : Orientation validée). Le démarrage corrige les anciens passeports au stade 5 disposant déjà d’une décision. Les orientations conservent leurs codes internes pour compatibilité avec les décisions et marchés existants.

## Rapport PDF progressif

`GET /api/batteries/:id/report.pdf`, session requise pour les trois rôles. Génère un instantané du passeport courant en appliquant la projection du rôle connecté. Réponse application/pdf avec Content-Disposition attachment ; 401 sans connexion, 404 si la batterie est absente. Les signatures simulées proviennent uniquement des actions déjà enregistrées. Aucun changement Neo4j n’est produit par l’export.
