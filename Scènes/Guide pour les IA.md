# Guide pour créer une scène Sully's Mii-Bongo

Tu vas créer (ou modifier) une **scène 3D** pour l'application *Sully's Mii-Bongo* : un petit personnage Mii
qui joue au clavier, à la manette ou aux bongos, entouré d'un décor fait de formes simples. La scène est un
**fichier JSON**. Réponds **uniquement avec le JSON**, dans un bloc ```json, sans commentaires dans le JSON.

## Repère et unités

- **1 unité = la hauteur du Mii.** Le Mii est petit et a une grosse tête : imagine qu'il mesure environ 1 m.
- **Origine (0, 0, 0)** : au sol, sous les pieds du Mii. **y** = hauteur (0 = le sol).
- **x** : `+x` = à **gauche** du Mii (à droite de l'image quand on le regarde de face), `-x` = à sa **droite**.
- **z** : le Mii **regarde vers +z**. `+z` = devant lui (son bureau, ses écrans), `-z` = derrière lui.
- `pos` = **centre de la base** de l'objet (le dessous de l'objet est à la hauteur `pos[1]`).
  Un objet posé au sol a donc `pos[1] = 0`.
- `rot` = rotation en **degrés** `[x, y, z]`. La face avant d'un objet regarde vers `+z` quand `rot = [0, 0, 0]`.
  - `rot[1] = 180` : la face regarde vers `-z` (vers le Mii, pour un objet placé devant lui).
  - `rot[1] = 90` : la face regarde vers `+x` ; `rot[1] = -90` : vers `-x`.
  - Exemple : un tableau accroché au mur de gauche (`x = +1.5`) et tourné vers le Mii → `rot: [0, -90, 0]`.
- `size` = `[largeur (x), hauteur (y), profondeur (z)]`, avant rotation.

## Place déjà occupée (à laisser libre)

- **Le Mii** : `x` de -0,4 à 0,4, `z` de -0,3 à 0,3, hauteur 1.
- **Son bureau** (mode clavier + souris) : plateau à 0,27 de haut, `x` de -0,3 à 0,3, `z` de 0,1 à 0,4.
- **Écrans du décor** (s'ils sont activés) : centrés vers `z = 0,6`, à 0,62 de haut, environ 0,5 de large.
- Pour qu'on voie bien le Mii, évite de mettre de grands objets entre lui et `+z` à moins de 1,5 de distance
  (sinon l'appli les rend invisibles quand ils le cachent).

## Ordres de grandeur

| Élément | Taille conseillée `[l, h, p]` |
|---|---|
| mur d'une pièce | `[3, 1.6, 0.08]` (hauteur 1,4 à 2) |
| sol d'une pièce | plaque `[3, 0.03, 3]` posée à `y = -0.03` (son dessus au niveau du sol) |
| porte | panneau `[0.6, 1.25, 0.04]` |
| fenêtre | panneau en `verre` `[0.8, 0.6, 0.02]` à `y ≈ 0.6` |
| lit | matelas `[0.8, 0.12, 1.2]` + cadre en cube `[0.85, 0.2, 1.25]` |
| chaise / tabouret | assise `[0.3, 0.04, 0.3]` à `y ≈ 0.25` |
| étagère | plaques `[0.8, 0.03, 0.25]` empilées tous les 0,3 |
| plante | colonne (pot) `[0.2, 0.2, 0.2]` + boule verte `[0.3, 0.3, 0.3]` dessus |
| lampe | colonne fine `[0.04, 0.8, 0.04]` + boule `[0.18, 0.18, 0.18]` en haut |

Construis les meubles **en assemblant plusieurs formes**. Reste sous ~150 objets.

## Format

```json
{
  "format": "sullys-mii-bongo-scene",
  "version": 2,
  "nom": "Nom de la scène",
  "description": "Une phrase qui décrit la scène",
  "base": { "table": { … }, "screens": [ { … }, { … } ] },
  "objects": [ { … }, { … } ]
}
```

`base` est facultatif. `objects` est la liste des objets.

### Un objet

| Champ | Valeurs |
|---|---|
| `type` | `cube`, `wall` (mur), `plate` (plaque / sol / plafond), `column` (colonne, cylindre), `sphere` (boule), `pyramid`, `stairs` (escalier, il monte vers `-z`), `panel` (panneau, cadre, porte, image), `screen` (écran), `light` (lumière) |
| `name` | nom lisible, ex. `"Mur du fond"` |
| `pos` | `[x, y, z]` |
| `rot` | `[x, y, z]` en degrés |
| `size` | `[l, h, p]` |
| `tex` | texture : `uni`, `bois`, `brique`, `beton`, `pierre`, `carrelage`, `damier`, `moquette`, `gazon`, `metal`, `marbre`, `papier` (papier peint), `verre` (transparent) |
| `color` | couleur `#rrggbb` qui **teinte** la texture (`#ffffff` = couleurs naturelles de la texture ; pour une couleur franche, utilise `uni` + la couleur) |
| `texScale` | taille du motif (1 = normale, 2 = motif deux fois plus grand) |

Pour une **lumière** (`type: "light"`) : une ampoule qui éclaire autour d'elle et projette des ombres. `pos` = sa place
(en hauteur, ex. `[0.6, 1.8, 0.8]`), `color`, `intensity` (3 par défaut, 0 à 50), `range` (portée, `0` = infinie),
`shadow` (`true` / `false`), `bulb` (`true` pour voir l'ampoule). Une ou deux lumières suffisent.

Pour un **écran** (`type: "screen"`) : `size` = `[largeur, hauteur, épaisseur]` (ex. `[0.9, 0.51, 0.04]`),
`source` = ce qu'il affiche : `1` (écran principal de l'utilisateur), `2` (son 2ᵉ écran)… ou `"off"` (éteint) ;
`stand` = `true` pour un pied jusqu'au sol ; `color` = couleur du cadre. Sa `pos` est le bas de l'écran.

N'utilise **pas** `type: "glb"` ni `tex: "img:…"` sauf si l'utilisateur te donne des noms de fichiers
(ce sont ses propres modèles 3D et images).

### Éléments de base (facultatif)

```json
"base": {
  "table": { "tex": "bois", "color": "#ffffff", "texScale": 1, "legColor": "#222222",
             "padColor": "#6a2a8a", "width": 1, "depth": 1, "hidden": false },
  "screens": [
    { "source": 1, "color": "#1b1b20", "hidden": false },
    { "source": 2, "color": "#1b1b20", "hidden": false, "pos": [-0.5, 0.62, 0.47], "rot": [0, 155, 0], "size": 1 }
  ]
}
```

- `table` : la table du bureau du Mii (mode clavier + souris). `width` / `depth` = multiplicateurs (0,6 à 2,5).
  `legColor` = pieds, `padColor` = tapis de souris. On ne peut pas la déplacer.
- `screens` : les deux écrans du décor (quand l'utilisateur a activé « Deux écrans »).
  `pos` (centre de l'écran), `rot`, `size` (multiplicateur) sont facultatifs : sans eux, ils restent à leur place.

## Exemple complet

```json
{
  "format": "sullys-mii-bongo-scene",
  "version": 2,
  "nom": "Petite chambre",
  "description": "Murs en papier peint, parquet, une fenêtre, un tableau et une plante",
  "base": { "table": { "tex": "bois", "color": "#ffffff", "legColor": "#3a2a1a", "padColor": "#2a4a8a" } },
  "objects": [
    { "type": "plate", "name": "Parquet", "pos": [0, -0.03, 0.3], "size": [3, 0.03, 3], "tex": "bois", "color": "#ffffff" },
    { "type": "wall", "name": "Mur du fond", "pos": [0, 0, -1.2], "size": [3, 1.6, 0.08], "tex": "papier", "color": "#ffffff" },
    { "type": "wall", "name": "Mur de gauche", "pos": [1.5, 0, 0.3], "rot": [0, 90, 0], "size": [3, 1.6, 0.08], "tex": "papier", "color": "#ffffff" },
    { "type": "panel", "name": "Fenêtre", "pos": [0.5, 0.55, -1.15], "size": [0.8, 0.55, 0.02], "tex": "verre", "color": "#bfe3ff" },
    { "type": "panel", "name": "Tableau", "pos": [1.45, 0.6, 0], "rot": [0, -90, 0], "size": [0.5, 0.4, 0.02], "tex": "uni", "color": "#d6a03a" },
    { "type": "column", "name": "Pot", "pos": [-1.1, 0, -0.9], "size": [0.2, 0.2, 0.2], "tex": "beton", "color": "#c8643c" },
    { "type": "sphere", "name": "Plante", "pos": [-1.1, 0.18, -0.9], "size": [0.35, 0.35, 0.35], "tex": "gazon", "color": "#ffffff" },
    { "type": "screen", "name": "Télé", "pos": [-1.4, 0.45, 0.3], "rot": [0, 90, 0], "size": [0.9, 0.51, 0.04], "source": 1, "stand": false, "color": "#111111" }
  ]
}
```

Maintenant, crée la scène demandée par l'utilisateur (ci-dessous). Réponds seulement avec le JSON.
