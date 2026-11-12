# Sully's Mii-Bongo

Application Windows dans l'esprit de *Bongobs Cat* (version clavier + souris) : votre Mii 3D (`Défaut.glb`)
est assis à un bureau, tape sur son clavier quand vous tapez, tient une souris qui suit la vôtre,
**parle quand vous parlez** (bouche animée par le micro) et **cligne des yeux**. La tête suit le curseur.

Elle fonctionne de deux façons en même temps :

1. **Fenêtre overlay** sur le bureau : transparente, toujours au premier plan, déplaçable.
2. **Source OBS** : l'appli sert la scène sur `http://localhost:7878/`, à ajouter comme *Source navigateur*.

## Lancer

Double-cliquez sur **`Sully's Mii-Bongo.exe`** (dossier `D:\Mii\Sully's Mii-Bongo`, ou le raccourci
`Sully's Mii-Bongo` dans `D:\Mii`).
Il faut le *.NET 10 Desktop Runtime* et *WebView2* (déjà présent sur Windows 11).

Le dossier de l'appli ne contient que l'essentiel :

| Élément | Contenu |
|---|---|
| `Sully's Mii-Bongo.exe` | l'application (les pages 3D, les manettes 3D et l'icône sont intégrées dedans) |
| `Mii\` | **vos Mii** (modèles 3D : voir *Formats 3D acceptés*) |
| `Visages\` | **les visages** (bouche qui parle, yeux fermés), communs à tous les Mii : un sous-dossier par visage |
| `Images\` | vos images pour l'éditeur de scène (textures, posters) |
| `Objets\` | vos modèles 3D à placer avec l'éditeur de scène |
| `Manettes\` | vos manettes créées avec l'**éditeur de manettes** (`.json`) et vos modèles 3D de manettes |
| `Scènes\` | vos **préréglages de scène** et scènes exportées (`.json`), un exemple, et le **Guide pour les IA** (pour faire créer des scènes par une IA) |
| `Personnage\` | l'**éditeur de personnage** : `Expressions\` (visages en plus), `Accessoires\` (modèles 3D à accrocher au Mii), `Personnage.json` |
| `Lisez-moi.md` | ce mode d'emploi |
| `Licences\` | crédits et licences des éléments tiers |

Vos réglages sont enregistrés dans `%APPDATA%\Sully's Mii-Bongo\settings.json` (ceux de l'ancienne version
« Mii Bongo » sont repris au premier lancement, ainsi que le lancement au démarrage de Windows).

Une icône de bouffon apparaît dans la zone de notification.

**Double-cliquez sur l'icône** (ou clic droit → *Ouvrir les réglages de Sully's Mii-Bongo…*) pour ouvrir la
**fenêtre de réglages**. À gauche, 5 pages (sous chacune, un résumé de vos réglages actuels) et des raccourcis
vers l'**Éditeur** (il rouvre la dernière page utilisée : scène, personnage ou manettes) ; la page ouverte la dernière fois est rouverte :

| Page | Contenu |
|---|---|
| 🎹 Instrument | Clavier + souris, Bongos, Manette, Volant, Debout (casque VR) — puis **seulement** les réglages de l'instrument choisi : modèle de manette et vos manettes, rotation du volant et pédales, miroir et recentrage VR, état en direct |
| 🃏 Personnage | Mii et visage (avec aperçu), voix (micro, sensibilité), **extras** : un interrupteur par expression / objet accroché (avec son raccourci) et l'**éditeur de personnage** |
| 🪟 Affichage | fenêtre sur le bureau (afficher, premier plan, verrouiller, taille, fond, **fluidité** : Fluide 60 img/s, **Auto** 60 pendant l'activité et 30 au repos, Économe 30 img/s) ; caméra (cadrage, vue orbitale) |
| 🏠 Décor & scène | décor (vue, décorations, sol), écrans en direct (fluidité), éditeur de scène et vos objets |
| ⌨️ Raccourcis | **tous les raccourcis clavier** au même endroit : en créer pour les réglages (changer d'instrument, instrument suivant, afficher / masquer ou verrouiller la fenêtre, cadrage, vue orbitale, décor, objets, micro, désactiver les extras, modèle de manette, fluidité, recharger), changer ou supprimer ceux des extras (avec *Appuyer* / *Maintenir*), interrupteur général, alerte si une combinaison sert deux fois |
| 🎨 Thème | **Classique** (sombre), **Wii** (clair, boutons blancs arrondis, sélection bleue), **Carnet** (papier, encre, traits à main levée), **Notice** (onglets, sections numérotées, cases à cocher), **Windows**, **Xbox**, **Switch** ou **PlayStation** (chacun avec sa propre disposition) ; Wii, Windows et Switch existent aussi en **version sombre** : réglages, trois éditeurs et menu de l'icône |
| 📺 OBS & système | URL pour OBS, démarrage avec Windows, ancien menu complet, **⚡ Performances** (images par seconde et saccades de chaque page qui affiche le Mii) |

Relancer `Sully's Mii-Bongo.exe` alors qu'il tourne déjà ouvre aussi la fenêtre de réglages.
Le clic droit sur l'icône garde l'essentiel : *Afficher la fenêtre*, *Copier l'URL pour OBS*, les trois éditeurs, *Recharger*, *Quitter*.

Vous préférez l'ancien menu ? Bouton **☰ Menu contextuel classique** en haut de la fenêtre de réglages : le clic droit
redevient le menu complet (et le double-clic affiche le Mii). Pour revenir à la fenêtre : menu complet →
**Utiliser la fenêtre de réglages**.

La fenêtre de réglages dialogue avec l'appli par le canal interne de WebView2 : aucun site web ouvert
dans votre navigateur ne peut modifier vos réglages.

Dans la fenêtre : **glisser** pour la déplacer, **molette** pour la redimensionner,
**clic droit + glisser** pour tourner autour du Mii (vue orbitale), **Ctrl + molette** pour zoomer.

## Éditeur de scène

Pour construire un décor à votre goût autour du Mii : réglages → **Éditeur de scène → ✏️ Ouvrir l'éditeur**
(ou clic droit sur l'icône → *Éditeur de scène…*, ou `"Sully's Mii-Bongo.exe" --editor`).
L'éditeur s'ouvre dans sa propre fenêtre, avec votre Mii et vos réglages actuels.

Les trois éditeurs (**scène**, **personnage**, **manettes**) sont les pages d'une **seule fenêtre « Éditeur »** : les
onglets *🧱 Scène · 🃏 Personnage · 🎮 Manettes*, en haut à gauche de la barre d'outils, passent de l'un à l'autre
(ce qui n'était pas encore enregistré l'est avant de changer de page). Les boutons des réglages et du menu de l'icône
ouvrent cette fenêtre directement sur la bonne page.

**Ajouter** (panneau de gauche) : 🧊 Cube, 🧱 Mur, ⬜ Plaque / sol, 🏛️ Colonne, ⚪ Boule, 🔺 Pyramide,
🪜 Escalier, 🖼️ Panneau / image, 🖥️ **Écran**, 💡 **Lumière**, et 📦 vos **objets 3D** (dossier `Objets`, voir *Formats 3D
acceptés*). **📥 Modèle 3D…** et **📥 Image…** choisissent un fichier sur le PC et le copient dans le bon dossier (un
modèle importé est ajouté directement à la scène). Le nouvel objet apparaît au sol, au milieu de la vue. La liste
*Dans la scène* permet de le resélectionner.

**💡 Lumière et ombres** : une lumière ponctuelle (comme une ampoule) qui éclaire autour d'elle et **projette des
ombres** : le Mii, la table, vos objets 3D et le décor s'ombrent les uns les autres, ce qui leur donne du relief. Réglages :
couleur, intensité, portée (*infinie* par défaut), *Projette des ombres*, *Ampoule visible* (dans la fenêtre du Mii et
OBS ; dans l'éditeur elle est toujours montrée pour pouvoir la saisir). L'ombre tombe à l'opposé de la lumière : placez-la
en hauteur, un peu derrière ou sur le côté de ce qui doit avoir une ombre. Chaque lumière à ombres redessine la scène
plusieurs fois : une ou deux suffisent.

Sous *Projette des ombres*, choisissez ce qui fait de l'ombre pour cette lampe : *Ombre du personnage* (avec ses objets
accrochés et les mini Mii), *Ombre de l'instrument* (clavier, souris, manette, bongos, volant, manettes VR) et *Ombre du
décor et des objets*. Dans la fenêtre du Mii et OBS, l'ombre est calculée une fois puis figée pour ne pas ralentir vos
jeux : décochez le personnage et l'instrument pour ne pas garder une ombre immobile de ce qui bouge.

**🖱️ Tapis de souris** (élément de base, mode clavier + souris) : matière, couleur, motif, largeur, profondeur, position,
rotation, ou masqué. Il reste toujours **posé sur la table**, même quand elle change de hauteur (autre personnage,
chaise). La souris du Mii garde sa **zone de mouvement d'origine** : seul le tapis change.

**Placer** :

| Action | Effet |
|---|---|
| clic | sélectionner (cadre jaune) : le **repère 3D** apparaît |
| flèches **X** (rouge), **Y** (verte), **Z** (bleue) | déplacer sur un axe |
| carrés gris | déplacer dans un plan |
| arcs | tourner autour d'un axe |
| boules sur les axes | changer la taille |
| point jaune au centre | déplacer face à la caméra |
| glisser un objet | le déplacer sur le sol |
| `Maj` + glisser | le monter / descendre |
| clic droit + glisser | tourner autour de la scène |
| clic molette (ou `Maj` + clic droit) + glisser | déplacer la vue |
| molette | zoomer |
| `Q` / `E` | pivoter de 15° |
| flèches, `Page↑` / `Page↓` | ajuster la position (avec `Alt` : tout petit pas) |
| `Ctrl`+`D`, `Suppr`, `Ctrl`+`Z` / `Ctrl`+`Y` | dupliquer, supprimer, annuler / rétablir |
| `F` | centrer la vue sur l'objet |

**Réglages de l'objet** (panneau de droite) : nom, position, rotation (pivoter, incliner), taille (largeur, hauteur,
profondeur ; une seule taille pour un objet 3D), **texture**, **couleur** (teinte la texture) et taille du **motif**.
Boutons *Au sol*, *Dupliquer*, *Supprimer*.

**Écrans** : un objet *Écran* affiche ce que vous choisissez en un clic dans **Affiche** : *Écran 1 (principal)*,
*Écran 2*… (vos vrais écrans, en direct), *Éteint*, ou une de vos images. Options : *Pied jusqu'au sol*, couleur du
cadre, bouton *16:9*. Ajoutez-en autant que vous voulez ; un nouvel écran se tourne tout seul vers le Mii, et le Mii
regarde l'écran où se trouve votre souris. La capture de vos écrans démarre toute seule quand un objet *Écran* en a
besoin (réglages → Décor → *Écrans* : fluidité, ou *Désactivé*).

**Éléments de base** (liste à gauche) : ce qui fait partie de la configuration, modifiable aussi :

| Élément | Réglages |
|---|---|
| 🧍 Le Mii (sa place) | **avancer / reculer** (plus près ou plus loin du bureau, de la manette, du volant…) et décaler à gauche / droite, avec des curseurs ou en le faisant glisser dans la vue ; seul le Mii bouge, avec sa chaise : l'instrument reste en place et ses bras le suivent |
| 🪑 Table du bureau (mode clavier + souris) | texture et couleur du plateau, taille du motif, **largeur** et **profondeur**, couleur des pieds et du tapis de souris, *Masquer la table*, *Table d'origine* (le clavier et la souris restent en place) |
| 🖥️ Écrans 1 et 2 du décor (décor + « Deux écrans ») | **ce qu'ils affichent**, position (glisser comme un objet), rotation, taille, couleur du cadre, *Masquer*, *Remettre à sa place d'origine* |

**Textures** : Uni, Bois, Brique, Béton, Pierre, Carrelage, Damier, Moquette, Gazon, Métal, Marbre, Papier peint,
Verre (transparent), et **vos images** (dossier `Images` : PNG, JPG ou WEBP). Sur un *Panneau / image*, l'image est
affichée en entier (poster, tableau, logo) ; sur les autres formes, elle se répète comme un motif.

En haut : *Annuler*, *Rétablir*, **🧲 Aimant** (pas de 0,05 et angles de 15°), *Masquer le Mii* (pour placer des objets
derrière lui), *Tout voir*.

- Unités : **1 = la hauteur du Mii debout**. La hauteur 0 est le sol. La scène ne bouge pas quand vous changez de
  personnage, de cadrage (buste ou corps entier) ou de décor (chaise, cinéma) : vos objets restent au même endroit.
- Chaque modification est **enregistrée toute seule** (`%APPDATA%\Sully's Mii-Bongo\scene.json`) et apparaît
  aussitôt dans la fenêtre du Mii et dans OBS, sans recharger.
- Vos objets s'affichent dans toutes les vues (avec ou sans décor). Pour les masquer : réglages → *Afficher mes objets*.
- **Un objet qui cache le Mii devient invisible** (en fondu), puis réapparaît quand il ne le cache plus — dans toutes
  les vues, y compris la vue orbitale et OBS. Désactivable : réglages → Éditeur de scène →
  *Rendre invisibles les objets qui cachent le Mii*. (Dans l'éditeur, tout reste visible pour pouvoir travailler.)

### Préréglages de scène

Gardez plusieurs scènes complètes (objets, table, écrans du décor) sous un nom et passez de l'une à l'autre d'un clic :

- **dans l'éditeur**, section **💾 Préréglages** : *Enregistrer la scène…* (même nom = remplace), un clic sur un nom pour le
  charger (annulable avec `Ctrl`+`Z`), ✏️ pour renommer, 🗑 pour supprimer (le fichier va dans la Corbeille). Celui qui est
  chargé est surligné, avec « modifiée depuis » si vous l'avez changé sans le réenregistrer ;
- **dans les réglages**, page *Décor & scène* → **Préréglages de scène** : charger, renommer, supprimer, ou enregistrer la
  scène actuelle sous un nouveau nom ;
- **depuis le menu de l'icône** (menu complet) : *Préréglages de scène* ;
- **avec un raccourci** (page *Raccourcis*) : *Scène : <nom>*, *Scène : préréglage suivant* ou *précédent*.

Chaque préréglage est un fichier `.json` du dossier `Scènes` : les scènes exportées, celles écrites par une IA ou déposées à
la main y apparaissent aussi. Une scène chargée depuis les réglages ou un raccourci s'affiche aussitôt dans la fenêtre du Mii,
dans OBS et dans l'éditeur s'il est ouvert.

### Importer, exporter, faire créer une scène par une IA

En haut à gauche de l'éditeur, section **Scène** :

- **📤 Exporter** : nom + description, puis *Enregistrer le fichier…* (dossier `Scènes` par défaut), ou
  *Copier le texte*. Le fichier `.json` se partage tel quel.
- **📥 Importer** : choisissez un fichier de scène. L'éditeur montre ce qu'il contient (nombre d'objets, remarques
  s'il a dû corriger des choses) puis propose **Remplacer ma scène** ou **Ajouter à ma scène** (annulable avec `Ctrl`+`Z`).
- **📋 Coller** : collez une scène copiée ou **la réponse d'une IA** : le texte autour du JSON, les balises de code, les
  virgules en trop ou les commentaires sont ignorés, et les noms en français ou en anglais sont compris
  (« mur », « wall », « brique », « brick »…).
- **🤖 Avec une IA** : *Copier le guide*, collez-le dans ChatGPT, Claude, Gemini… puis décrivez la scène voulue
  (« une chambre de gamer avec des néons violets »), copiez la réponse et faites **📋 Coller**.
  *Copier aussi ma scène actuelle* permet de demander à l'IA de **modifier** votre scène.

Le guide (format, repère, tailles conseillées, exemple complet) est aussi dans `Scènes\Guide pour les IA.md`, avec une
scène d'exemple : `Scènes\Exemple - Petite chambre.json`.
- Le cadrage automatique ne tient pas compte de vos objets : utilisez la vue orbitale pour cadrer large.

## Éditeur de manettes

Réglages → **Manette → ✏️ Éditeur de manettes** (ou clic droit sur l'icône → *Éditeur de manettes…*,
ou `"Sully's Mii-Bongo.exe" --manettes`). L'éditeur s'ouvre dans sa propre fenêtre.

**Les manettes** (à gauche) : les 3 intégrées (8BitDo, Xbox, Xbox 25 ans) et les vôtres.

| Bouton | Effet |
|---|---|
| ➕ Nouvelle | à partir d'un modèle intégré ou de **votre propre modèle** (déposé dans le dossier `Manettes`) |
| ⧉ Dupliquer | copie modifiable (d'une intégrée : la Xbox arrive avec toutes ses pièces déjà délimitées) |
| ✓ Utiliser | le Mii tient cette manette (aussi dans les réglages, *Vos manettes*) |
| 🗑 Supprimer / 🙈 Masquer | une manette à vous part dans la corbeille de Windows ; une intégrée est masquée des listes |

**Onglet Modèle** : tournez le modèle (boutons ↻ / ↺ X, Y, Z, ou au degré près) pour que ses boutons regardent la
**flèche bleue** et ses gâchettes la **flèche orange** ; puis sa taille, sa hauteur et son inclinaison dans les mains du
Mii, et la couleur de la lumière d'un bouton pressé. Orientez le modèle **avant** de délimiter les pièces.

**Texture du modèle** (onglet Modèle) : **🖌 Modifier dans Paint** enregistre la vraie texture de la manette dans le
dossier `Manettes` (une copie, l'original n'est jamais touché) et l'ouvre dans Paint ; dessinez, enregistrez, puis
**↻ Recharger**. *Utilisée* permet de choisir une autre image du dossier `Manettes`, ou de revenir à la texture
d'origine. (Une image exportée n'écrase jamais un fichier existant.)

**Onglet Pièces** (la délimitation) : **＋ Ajouter une pièce**, puis cliquez sur le bouton dans l'aperçu. L'éditeur
**trouve tout seul son contour** (le sillon autour du bouton, ou le bord du capuchon d'un stick) ; sinon, réglez-le :
forme (*Cercle*, *Pilule*, *Rectangle* arrondi), vue (*de face*, *de dessus* pour les gâchettes et bumpers, *de dos*,
*de côté*), centre, taille, coins, **profondeur** (ce qui est au-dessus appartient à la pièce). Le contour jaune montre
la zone ; **🎨 Repérer les pièces** colore chaque pièce. *📐 Ajuster au contour*, *⇋ Copie miroir* (crée la pièce
symétrique : stick droit, gâchette droite… avec le bon bouton), *▲ Monter* (priorité là où deux pièces se touchent).
La *Coque* est tout le reste. Chaque pièce (et la coque) a son **apparence** : *D'origine*, *Couleur* ou *Motif*
(*Fumée*, *Camouflage*, *Dégradé*, avec deux couleurs), **Texture** (bois, métal, marbre, papier peint… ou une de
vos images du dossier `Images`, projetée sur la pièce : ça marche sur n'importe quel modèle ; teinte et taille du
motif), finition *Mate* ou *Brillante*.

**Croix directionnelle** : une croix d'une seule pièce (Xbox, 8BitDo) → forme *Cercle* ou *Croix +*, bouton
*Croix (les 4 directions)* : elle bascule. Une **croix classique en 4 boutons** (PS4, PS5, Switch…) → sélectionnez la
pièce de la croix puis **✚ Croix en 4 flèches séparées** : 4 pièces *Flèche haut / bas / gauche / droite*, chacune
assignée à sa direction, qui s'enfoncent séparément.

**Onglet Formes** : ajoutez un **cylindre**, une **boîte**, une **boule** ou un **cône** — par exemple pour boucher le
trou sous un stick transparent ou un bouton qui laisse voir le vide. Position, rotation, taille, couleur ; **attachée à
une pièce**, la forme bouge avec elle.

**Onglet Boutons** (l'assignation) : pour chaque entrée de la manette (A, B, X, Y, LB, RB, LT, RT, sticks + clic, croix
entière ou chaque direction, View, Menu, Xbox), la pièce qui bouge. *🎯 A B X Y auto* assigne le losange de 4 boutons
(disposition Xbox : A en bas) ; *🔁 A↔B, X↔Y* passe en disposition Nintendo. **Testez avec votre vraie manette** : les
entrées pressées s'allument et les pièces s'enfoncent dans l'aperçu (la manette est lue tant que l'éditeur est ouvert).

Les noms des boutons sont donnés pour Xbox et PlayStation (A · ✕, B · ○, X · □, Y · △, LB · L1, LT · L2, View · Share,
Menu · Options, Xbox · PS).

Mouvements : un bouton s'enfonce, un stick pivote (et s'enfonce au clic), la croix bascule vers la direction pressée,
une gâchette pivote sur sa charnière. Tout est enregistré tout seul dans `Manettes\<nom>.json` ; si le Mii tient cette
manette, il la recharge quelques secondes après la dernière modification.

## Pendant les jeux : tête calme

Quand un jeu est au premier plan, la tête du Mii ne suit plus le curseur : chaque mouvement de souris la fait
**bouger à peine**, puis elle **revient d'elle-même au centre**. Hors des jeux, elle suit la souris comme avant.

Un jeu est reconnu tout seul quand sa fenêtre est **en plein écran** (ou plein écran fenêtré) ou qu'il **bloque la
souris** dans sa fenêtre (jeux de tir, caméra à la souris…). Pour un jeu en fenêtre qui laisse la souris libre :
Réglages → *Affichage* → **Pendant les jeux** → choisissez-le dans la liste des programmes ouverts → *➕ Ajouter*.
La carte indique aussi le jeu reconnu en ce moment. L'interrupteur *Tête calme* (et le raccourci *Tête calme pendant
les jeux : oui / non*) désactive tout ça.

### Jeux qui cachent le curseur (Minecraft, FPS, Roblox…)

Beaucoup de jeux à la première ou à la troisième personne **cachent le curseur et le ramènent au centre** à chaque
image (ou le bloquent sur place) pour tourner la caméra. Le curseur ne bouge alors presque plus, même quand vous
bougez la souris. L'appli s'en rend compte toute seule, sans liste de jeux : le curseur est caché ou bloqué, et il
reste immobile alors que la souris envoie des mouvements.

Dans ce cas, le Mii suit les **mouvements de la souris** au lieu de la position du curseur :

- sa souris 3D glisse sur le tapis dans le sens de vos mouvements et reste où vous l'avez laissée. Au bout du tapis,
  le Mii la lève et la repose vers le milieu, comme sur le bureau (jamais pendant que vous tenez un bouton : il garde
  la souris au bord tant que vous tirez). Si vous avez décoché *Le Mii lève sa souris au bout du tapis*, elle revient
  plutôt doucement au centre quand vous arrêtez ;
- avec *Tête calme* (réglage par défaut), ces jeux comptent comme des jeux : la tête bouge à peine et revient au
  centre. Sans *Tête calme*, la tête suit la souris du Mii ;
- en mode clavier à deux mains, la main revient sur la souris dès que vous la bougez, comme sur le bureau.

Dès que le jeu montre de nouveau le curseur (menu, inventaire, pause, Alt+Tab), le Mii reprend la position du curseur
comme d'habitude. Sur le bureau, rien ne change.

## Vue orbitale

Choisissez librement d'où l'on voit le Mii, avec ou sans décor :

- dans la fenêtre du Mii : **clic droit (ou clic molette) + glisser** pour tourner autour de lui
  (gauche / droite = faire le tour, haut / bas = hauteur), **Ctrl + molette** pour zoomer ;
- ou dans la fenêtre de réglages, section **Vue orbitale** : cadran vu de dessus (glissez la caméra autour du Mii),
  curseurs *Tourner* (−180° à 180°), *Hauteur* (−10° à 85°) et *Zoom* (50 à 300 %), et vues toutes prêtes
  (Face, Côté gauche, Côté droit, Dos, Dessus, Par défaut).

La vue orbitale remplace le cadrage (sans décor) ou la vue isométrique / trimétrique (avec décor) tant qu'elle est
activée ; désactivez-la pour revenir à la vue choisie avant. Elle s'applique **en direct**, y compris dans OBS,
sans recharger la page. Elle est enregistrée, et retrouvée au prochain lancement.

## OBS

1. Laissez Sully's Mii-Bongo tourner.
2. OBS → Sources → **+** → **Navigateur**.
3. URL : `http://localhost:7878/?follow=1&bg=transparent` (c'est ce que copie « Copier l'URL pour OBS »).
4. Largeur/hauteur : par ex. 600 × 600.

Avec `follow=1`, la source OBS **suit le menu de l'appli** : changez d'instrument, de cadrage,
de modèle, de manette ou l'effet miroir depuis l'icône du bouffon, et la source OBS se met à jour toute seule
(elle se recharge en une seconde ; la vue orbitale, elle, suit en direct sans recharger). Elle n'affiche aucun texte d'état, pour ne rien montrer au stream.
Le fond reste celui de l'URL (`bg=transparent`).

Sans `follow=1`, la source garde les réglages écrits dans son URL, avec les options ci-dessous
(pensez alors à choisir le même instrument dans le menu de l'appli, sinon l'appareil n'est pas lu).

Options d'URL :

| Paramètre | Valeurs |
|---|---|
| `follow=1` | suit les réglages du menu de l'appli (remplace `mode`, `view`, `model`, `mirror`) |
| `model` | nom du fichier dans le dossier `Mii` (défaut `Défaut.glb`) |
| `face` | nom du visage dans le dossier `Visages` (défaut `Défaut` ; vide = visage d'origine du modèle) |
| `objs=0` | masque les objets de l'éditeur de scène |
| `occ=0` | les objets qui cachent le Mii restent visibles |
| `pad=perso:Nom.json` | une manette créée avec l'éditeur de manettes (fichier du dossier `Manettes`) |
| `mode` | `keyboard` (clavier + souris, défaut), `bongo`, `vr` (debout, casque VR), `wheel` (volant) ou `pad` (manette) |
| `bg` | `transparent`, `green`, `dark` ou une couleur hex sans `#` (ex. `ff00ff`) |
| `view` | `bust` (buste) ou `full` (corps entier) |
| `mirror=1` | mode VR : effet miroir |
| `blink=0` | pas de clignement des yeux |
| `notes=0` | pas de notes de musique (mode bongo) |
| `look=0` | la tête ne suit plus la souris |
| `pad` | modèle de manette : `8bitdo` (défaut), `xbox` ou `xbox25` |
| `orbit=1&oaz=…&oel=…&oz=…` | vue orbitale : azimut et hauteur en degrés (0 = de face, 90 = côté gauche du Mii), zoom (1 = normal) |

Exemple : `http://localhost:7878/?bg=green&view=full`

## Décor (vue isométrique + décorations)

Menu *Décor → Activer le décor* : le Mii garde son instrument et sa configuration actuels, mais la
scène passe en **vue isométrique côté droit**, posée sur une petite estrade avec un tapis.

- *Vues isométriques arrière-gauche* (par défaut) *et arrière-droite* : on voit le Mii de 3/4 dos et ce qu'il y a devant lui.
- *Vue avant-droite* : on voit son visage, mais les décorations placées devant lui sont vues de dos.
- *Vues trimétriques* (côté gauche ou côté droit) : plus de côté et plus basses, cadrées sur tout le setup
  (Mii, bureau ou instrument, chaise, écrans) sans l'estrade :
  on voit le setup de plus près et le profil du Mii.

Avec la décoration « Deux écrans », **le Mii regarde l'écran où se trouve votre souris**, à l'endroit exact du
curseur (en haut, en bas, à gauche…). Si la souris est sur un 3e écran, il reprend son comportement normal.

Dans toutes les vues (avec ou sans décor), son bureau est disposé comme
le vôtre : clavier en face de sa main gauche, souris à sa droite.
Dans toutes les vues, sa souris bouge **comme la vôtre en vrai** : vous la tirez vers vous (vers le bas) → il la
ramène vers lui ; vous la poussez (vers le haut) → il la pousse vers le fond. De face, sa souris (main droite)
est donc vue à gauche de l'image quand il vous fait face.

**Décorations** (menu *Décor → Décorations*) — elles n'apparaissent que quand le décor est activé :

| Décoration | Description |
|---|---|
| Deux écrans | deux moniteurs qui affichent **en direct** vos écrans : votre écran **principal en face du Mii**, le secondaire à côté (du même côté que sur votre bureau), incliné vers lui |
| Cinéma | votre **écran principal devient un grand écran de cinéma** (rideaux rouges, lambrequin doré), l'écran secondaire disparaît ; en modes Clavier et Manette, le Mii est **presque allongé dans un fauteuil de cinéma** (repose-pieds sorti, pot de pop-corn) avec une petite tablette pour le clavier et la souris. Remplace la chaise et les deux écrans |
| Chaise de bureau | dossier haut en maille, appui-tête, accoudoirs, piètement chromé à roulettes : **le Mii s'assoit dessus** (son instrument est abaissé d'autant). Sans effet en mode Volant (il a déjà son baquet) et en mode casque VR (debout) |

**Sols** (fenêtre de réglages, section Décor) : Classique (estrade crème), 🪵 Plancher, ♟️ Carrelage damier,
🟦 Moquette (bleu nuit, bordure dorée) ou 🌿 Gazon. Ils sont dessinés par l'appli (aucune image à télécharger).

*Écrans* (fenêtre de réglages, section Décor) : **Désactivé** (écrans 3D éteints, aucune capture de vos écrans),
Économe (2 images/s), Normale (5, défaut) ou Fluide (10). La capture tourne en arrière-plan
(basse priorité, environ 15 % d'un cœur à 5 img/s) et seulement quand le décor, la décoration
« Deux écrans » et l'affichage du Mii sont actifs. Les images ne passent que par le canal réservé à la
page de l'appli (fenêtre ou source OBS), jamais par une adresse web publique.
Les jeux en plein écran « exclusif » peuvent apparaître noirs : utilisez le mode fenêtré sans bordure.

## Commandes

**Mode clavier + souris**
- Chaque touche fait taper la main gauche (côté écran) **à l'endroit de la touche** sur le clavier 3D,
  qui s'allume en rouge (position physique : marche en AZERTY comme en QWERTY).
- La souris 3D suit votre curseur ; les boutons s'allument et la main appuie quand vous cliquez.
- **Deux mains** : quand la souris est au repos, le Mii tape comme vous, avec les deux mains : la main de la souris
  la lâche pour taper les touches de droite (Y, H, N et à droite, Entrée, flèches…), l'autre main garde les touches de
  gauche, et la barre d'espace se tape du côté de la main libre. Tant que vous utilisez la souris, la main gauche tape
  seule et va jusqu'aux touches de droite. La main revient sur la souris dès que vous la bougez ou cliquez, ou après
  4 secondes sans taper.
- **Clavier qui glisse** : quand le Mii tape à deux mains, il fait glisser son clavier devant lui (sans toucher la
  souris), puis le remet à sa place en reprenant la souris. Désactivable dans Réglages → Instrument, carte
  **⌨️ Clavier + souris**.
- La souris 3D a une vraie forme : coque bombée, deux boutons séparés qui s'enfoncent au clic, molette qui tourne
  quand vous faites défiler. Sa taille se règle de 60 à 300 % (curseur **Taille de la souris** dans la même carte) ;
  la main du Mii reste posée dessus.
- **Bout du tapis** : quand votre curseur est collé à un bord de l'écran (le bord extérieur du bureau, pas celui
  entre deux écrans) et que vous continuez de pousser la souris dans ce sens, le Mii arrive au bout de son tapis :
  il **lève sa souris**, la ramène vers le milieu du tapis et la repose, comme dans la vraie vie. Si vous continuez de
  pousser, elle repart depuis le milieu, et il la relève au bout du tapis. Quand vous revenez vers l'intérieur de
  l'écran, la souris retrouve peu à peu sa place normale sur le tapis. Il ne la lève jamais pendant que vous tenez un
  bouton (glisser-déposer, sélection…). Activé par défaut ; pour l'enlever, décochez **Le Mii lève sa souris au bout
  du tapis** dans Réglages → Instrument, carte **⌨️ Clavier + souris** : la souris reste alors au bord du tapis, et
  dans les jeux elle revient doucement au centre.

**Mode bongos**
- Moitié gauche du clavier → bongo de gauche ; le reste → bongo de droite ; Espace alterne.
- Clic gauche → bongo de droite · clic droit → bongo de gauche · clic molette → les deux.

**Mode debout — casque VR (Quest 3)**

Le Mii est debout, porte un casque VR blanc et tient deux manettes. Sa tête suit votre casque
et ses bras suivent vos manettes (la gâchette s'allume en rouge quand vous appuyez).

1. Connectez le Quest 3 au PC avec **SteamVR** : Quest Link / Air Link (puis lancez SteamVR),
   ou Virtual Desktop en mode SteamVR.
2. Menu *Instrument → Debout — casque VR (SteamVR)*.
3. Regardez droit devant vous et cliquez *Casque VR → Recentrer*.

- L'appli se connecte à SteamVR en **arrière-plan** : rien ne s'affiche dans le casque, elle ne lance
  jamais SteamVR elle-même, et elle se reconnecte toute seule si SteamVR redémarre.
- Le corps du Mii reste face à la caméra : si vous vous tournez, il suit doucement ; la tête, elle,
  suit le casque immédiatement. Pencher la tête fait pencher le buste.
- Par défaut, votre main gauche est la main gauche du Mii (donc à droite de l'écran, comme une
  caméra). *Effet miroir* inverse, comme dans un miroir.
- Sans SteamVR, le Mii attend, manettes en main, et regarde la souris.
- Le jeu VR en cours (Beat Saber, VRChat…) continue normalement : l'appli ne fait que lire les positions.

Fonctionne aussi avec d'autres casques SteamVR (Index, Vive, Pico…) ; le Mii porte toujours le même casque blanc.

**Mode manette (8BitDo Ultimate 2C, Xbox…)**

Le Mii tient une grande manette, tournée vers lui comme un vrai joueur, un peu en avant du corps.
Le modèle se choisit dans la fenêtre de réglages (section **Manette**) :

| Modèle | Aspect |
|---|---|
| 8BitDo Ultimate 2C (défaut) | coloris Mint : dessus vert d'eau, dessous rose-beige, sticks / croix / A B X Y corail, gâchettes et bumpers vert-gris |
| Xbox Series | noire, d'après un scan 3D réel ; texture nettoyée (reflets verts et bleus du scan retirés, noirs relevés, coutures réparées, plus nette, 4096 px), lettres A B X Y colorées, bouton Xbox éclairé |
| Xbox édition 25 ans | même manette, coque **verte translucide traversée de volutes vert sombre**, A B X Y pleins aux couleurs d'origine (vert, rouge, bleu, jaune), bouton Xbox vert à logo clair, sticks et croix noirs, inscription « XBOX 25 » sur la poignée droite |
| **Vos manettes** | créées avec l'**éditeur de manettes** (voir ci-dessous) : votre propre modèle 3D, vos couleurs, votre disposition des boutons |

Toutes les pièces bougent : sticks, croix, A B X Y, View / Menu / Xbox, bumpers et gâchettes (qui pivotent sur leur charnière). Sa main gauche gère la partie
gauche (stick gauche, croix, LB/LT, −), sa main droite la partie droite (A B X Y, stick droit,
RB/RT, +, Home). Chaque main va sur le dernier bouton pressé de son côté et l'enfonce (il s'allume),
revient sur son stick sinon ; les sticks s'inclinent comme les vôtres, la croix bascule, et pour les
gâchettes la main agrippe le bord de la manette. Le Mii regarde droit devant lui (vers la caméra).

Si le modèle d'une manette ne peut pas être chargé, une manette simplifiée est utilisée à la place.

1. Allumez la manette en mode **X-input** (mode par défaut de la 8BitDo Ultimate 2C sur PC).
2. Menu *Instrument → Manette (8BitDo / Xbox)*.

- Lue via XInput, en arrière-plan : ça marche pendant que le jeu a le focus.
- **Manettes PlayStation** (DualShock 4 de PS4, DualSense de PS5) : lues directement, en USB ou en Bluetooth, sans
  logiciel en plus (✕ = A, ○ = B, □ = X, △ = Y, L1/R1 = LB/RB, L2/R2 = gâchettes, Share = View, Options = Menu,
  PS = Xbox). Si une manette XInput est aussi branchée (ou DS4Windows), c'est elle qui est lue.
- La manette n'est lue qu'en mode Manette **et** quand le Mii est affiché ; elle est cherchée au branchement
  et par une vérification légère toutes les 5 s (une manette sans fil qui s'allume ne prévient pas toujours Windows).
- Toute manette XInput marche (Xbox, 8BitDo, PowerA…). Les manettes en mode DirectInput/Switch
  ne sont pas lues : repassez-les en X-input.

**Mode volant (Logitech G27)**

Le Mii est assis dans un baquet, les mains sur un volant qui tourne exactement comme le vôtre.
Quand vous passez un rapport avec la boîte en H, sa main droite va sur le levier, qui se place
dans la bonne case (1 à 6, marche arrière), puis revient sur le volant. Ses pieds appuient sur les
3 pédales (embrayage, frein, accélérateur). Il se penche au freinage, se colle au dossier en
accélérant, subit la force centrifuge dans les virages et regarde dans la direction du virage.
Les palettes s'allument quand vous les tirez.

1. Branchez le G27 (G Hub ou Logitech Gaming Software lancé).
2. Menu *Instrument → Volant (Logitech G27)*.
3. Menu *Volant → Rotation* : choisissez le même angle que dans G Hub (900° par défaut).
4. Touchez le volant ou une pédale une fois : le G27 n'envoie ses valeurs qu'au premier mouvement
   (avant, le Mii garde les pédales relâchées).

- Le volant est lu en arrière-plan : ça marche pendant que le jeu de course a le focus.
- Le volant n'est cherché qu'en mode Volant **et** quand le Mii est affiché (fenêtre de l'appli ou source OBS) :
  une fois au démarrage, puis seulement quand Windows signale un branchement. Rien ne tourne sinon.
- Les pédales doivent être en mode « axes séparés » (réglage par défaut de G Hub) : accélérateur = axe Y,
  frein = axe RZ, embrayage détecté automatiquement (axe S1 sur le G27). Relâchée = 65535, enfoncée = 0.
- Marche avec d'autres volants Logitech/Thrustmaster/Fanatec, mais la boîte en H et les palettes
  peuvent utiliser d'autres numéros de boutons. Diagnostic : `"Sully's Mii-Bongo.exe" --wheel-test volant.txt`
  enregistre 8 s d'axes et de boutons (bougez tout pendant ce temps).
- Sans volant branché, le Mii attend, mains sur le volant, et regarde la souris.
- Cadrage *Corps entier* pour voir le baquet, les pieds et le pédalier.

**Partout**
- **Micro** → la bouche s'ouvre selon le volume de votre voix (4 niveaux), la tête hoche un peu. Sur un autre
  modèle 3D, c'est son os de mâchoire qui s'ouvre (voir *Autres personnages 3D*).
- Le Mii **cligne des yeux** toutes les 2 à 6 secondes (parfois deux fois de suite).
- **Molette** → petit hochement de tête. **Souris** → la tête suit le curseur.

### Le micro ne fait pas bouger la bouche ?

- Menu *Micro (bouche)* → choisissez votre vrai micro (ex. *fifine*) au lieu du micro par défaut.
- Passez la sensibilité sur **haute** si vous parlez doucement, **faible** si la bouche bouge avec le bruit de fond.
- Diagnostic : `"Sully's Mii-Bongo.exe" --mic-test niveaux.txt` mesure chaque micro pendant 2 s et écrit les niveaux en dB.

Seul le volume est mesuré : aucun son n'est enregistré ni envoyé.

## Visages (bouche et yeux) — communs à tous les Mii

Les visages sont dans le dossier **`Visages`** de l'appli, **un sous-dossier par visage**, et chaque Mii peut
utiliser n'importe lequel. On le choisit dans les réglages (section **Personnage → Visage**, avec un aperçu des
images), ou *Visage d'origine du Mii* pour garder le visage du modèle sans animation.

Un dossier de visage contient des PNG aux noms simples :

| Fichier | Rôle |
|---|---|
| `yeux fermés.png` | on en prend **les yeux** pour le clignement |
| `bouche 1.png` | bouche un peu ouverte (on n'en prend que **la bouche**) |
| `bouche 2.png`, `bouche 3.png`… | bouches de plus en plus ouvertes, autant que vous voulez |

- Les images ont la même disposition que la texture du visage des Mii (1024 × 1024, fond transparent).
- En silence, le Mii garde la bouche d'origine de son modèle ; plus vous parlez fort, plus le numéro de bouche est grand.
- Pour créer un visage : copiez le dossier `Défaut`, renommez-le, remplacez les images, puis *↻ Actualiser les listes*.
- Facultatif, `visage.json` dans le dossier : `{ "separation": 0.586, "materiau": "Mask" }` (hauteur qui sépare
  les yeux de la bouche, et nom du matériau du visage dans le `.glb`).

Le fichier `Visages\Lisez-moi.txt` rappelle tout ça.

## Éditeur de personnage (expressions et objets accrochés)

Réglages → carte **Extras du personnage** → **✏️ Éditeur de personnage** (ou clic droit sur l'icône →
*Éditeur de personnage…*). La fenêtre montre votre Mii tel qu'il est (instrument, manette…) ; l'ajout sélectionné
y est toujours visible. Glisser : tourner autour · clic droit + glisser : déplacer la vue · molette : zoom.

**Expressions** (🙂 + Expression) : un visage en plus qui remplace **les yeux**, **la bouche** ou **les deux**.

- **🖌 Créer dans Paint** : une copie du visage actuel du Mii est enregistrée dans `Personnage\Expressions` et
  s'ouvre dans Paint. Dessinez, enregistrez (Ctrl+S), revenez dans l'éditeur : l'image est rechargée toute seule
  (sinon **↻ Recharger**). **✏️ Modifier dans Paint** rouvre l'image choisie.
- Ou déposez vos PNG dans `Personnage\Expressions` (même disposition que les images du dossier `Visages`).
- *Quand vous parlez* : **🗣 La bouche parle** (la bouche animée par le micro passe devant) ou **🔒 Garder cette
  bouche** (ex. une grande bouche ouverte qui ne bouge pas).
- Si deux expressions actives touchent la même partie du visage, la dernière activée l'emporte. Une expression
  qui change les yeux remplace le clignement.

**Objets accrochés** (🎩 + Objet 3D) : vos modèles 3D du dossier `Personnage\Accessoires` (chapeau, lunettes,
épée, ailes…) ou une forme simple (cube, boule, pyramide, colonne…, avec couleur et texture).

- **Accroché à** : tête, corps, taille, main gauche ou main droite — l'objet suit la tête qui tourne, les mains qui tapent…
- Position (gauche/droite, bas/haut, arrière/avant), rotation et taille : curseurs. Le modèle est centré et mis à
  l'échelle tout seul ; un objet accroché à la tête commence posé dessus.

**Activation** de chaque ajout :

- son **interrupteur** (réglages, menu complet de l'icône, ou dans l'éditeur) ;
- et/ou un **raccourci clavier** : **⌨ Choisir…** puis appuyez sur la combinaison (Échap pour annuler).
  - *👆 Appuyer* : une pression active, une autre désactive.
  - *⏬ Maintenir* : actif seulement tant que la touche est enfoncée.
  - Les raccourcis marchent partout, même en jeu, et ne bloquent pas la touche : choisissez des combinaisons libres
    (Ctrl+Maj+F1…F12, pavé numérique…). AltGr est reconnu à part (AltGr+2 pour « ~ » ne déclenche rien).
- *Mii* : un ajout peut être réservé à un seul de vos Mii.

Exemples fournis (désactivés) : *Yeux fermés* (Ctrl+Maj+F1), *Grande bouche* (maintenir Ctrl+Maj+F2),
*Chapeau pointu* (Ctrl+Maj+F3). Tout est enregistré dans `Personnage\Personnage.json` ; la fenêtre du Mii et OBS
suivent en direct.

### Animations (coucou, victoire…)

Éditeur de personnage → onglet **👋 Animations** : faites faire un geste au Mii d'une touche ou d'un clic.

- **Nouvelle animation** : partez d'un modèle (*Coucou*, *Victoire*, *Oui de la tête*, *Non de la tête*, *Applaudir*,
  *Danse*, *Je sais pas*) ou d'une animation vide, puis *👋 + Animation*.
- Une animation est une suite de **poses clés**. Pour chaque clé : son **moment** (en secondes), la position de chaque
  **main** (écarter, hauteur, avancer ; décochée = la main reste libre et continue de taper, de tenir la manette…), la
  **tête** (tourner, lever / baisser, pencher) et le **buste** (en avant, sur le côté). Le Mii passe en douceur d'une clé
  à l'autre, puis reprend ce qu'il faisait.
- **Frise en bas** : *▶ Aperçu* joue l'animation en boucle dans l'éditeur ; glissez une clé pour changer son moment,
  double-cliquez sur la frise pour ajouter une clé à cet endroit. *⇋ Miroir* échange gauche et droite.
- **Copier / coller des clés** : *📋 Copier la clé* (`Ctrl`+`C`), *📥 Coller sur cette clé* (`Ctrl`+`V`, remplace la
  pose en gardant le moment) ou *➕ Coller en nouvelle clé* (`Ctrl`+`Maj`+`V`). On peut coller dans une autre animation.
- **Repère 3D sur les mains** : chaque main active de la clé choisie a ses flèches pour la placer directement.
- **Lecture** : *Une fois par appui* (le raccourci, le bouton ▶ des réglages ou du menu de l'icône jouent le geste
  une fois) ou *En boucle* (un interrupteur, comme les autres extras). *Joue tant que la touche est enfoncée* est aussi
  possible.
- **📺 Jouer sur le Mii** la joue tout de suite dans la fenêtre du Mii et dans OBS.
- **Objets qui apparaissent** : *🎩 + Objet dans l'animation* ajoute un objet (un modèle 3D du dossier
  `Personnage\Accessoires`, à importer avec 📥, ou une forme simple) qui n'existe que pendant le geste : une pancarte dans
  la main, une couronne sur la tête, un gâteau sur le bureau… Il peut être **accroché** (tête, corps, taille, main gauche
  ou droite *à l'écran*, comme les mains des clés) et suit alors le Mii, ou **libre** : posé dans la scène à côté du Mii.
  On le place avec les flèches, arcs et boules (ou les curseurs), et on choisit quand il **apparaît** et **disparaît**
  (en secondes, ou *⏱ Clé actuelle*, ou *Fin*) ; il surgit et s'efface avec un petit effet. Les objets choisis sont
  toujours visibles dans l'éditeur pour les placer, et leurs moments sont marqués en bleu sur la frise.

Les animations sont enregistrées dans `Personnage\Personnage.json` avec les autres extras. Elles ne s'appliquent pas en
mode Debout (VR), où les bras suivent le casque et les manettes.

### Physique (pompons, mèches, antennes…)

Éditeur de personnage → onglet **🎈 Physique** : une partie du Mii ou d'un objet accroché ballotte quand il bouge.

1. Choisissez le **genre** (*Pompon*, *Tissu, cheveux*, *Ressort, antenne*, *Gelée*) puis **🎈 + Physique** ;
2. **cliquez sur la partie qui doit bouger**, par exemple le pompon du chapeau. Une boule jaune montre la zone : son
   cœur bouge d'un bloc, le bord se déforme en douceur ;
3. ajustez la **taille** de la zone (curseur, ou les boules du repère 3D ; ses flèches la déplacent), puis
   **🫨 Secouer** pour voir le résultat.

Les curseurs **Souplesse** (raide → mou), **Rebond** (s'arrête vite → ballotte longtemps) et **Ampleur** (jusqu'où ça
peut partir) affinent le comportement. **⧉ Dupliquer et placer** reprend les mêmes réglages pour une autre partie (le
deuxième pompon) : cliquez-la ensuite. *📍 Replacer* déplace une zone, l'interrupteur la coupe.

**🖌 À colorier**, comme les pièces de l'éditeur de manettes : au lieu d'une boule, vous **coloriez sur le modèle** ce qui
doit bouger (en jaune ; les autres zones en bleu). Outils : **🖌 Pinceau** (taille réglable), **🧽 Gomme** (ou `Maj` + clic),
**🪣 Remplir une pièce** (colorie d'un coup une pièce détachée, comme un pompon séparé du chapeau, avec un fondu sur ce
qui la tient pour qu'elle reste attachée), **↶ Annuler** (`Ctrl`+`Z`) et *Tout effacer*. Clic droit + glisser tourne
autour du Mii pendant le coloriage. Une boule peut être changée en zone coloriée (et inversement) : le coloriage part
de la boule. Faites une zone par partie (⧉ *Dupliquer*) pour que chacune bouge de son côté.

Les pièces du modèle n'ont pas besoin d'être séparées : la zone déforme seulement ce qui est dans la boule ou colorié. Les zones
sont enregistrées dans `Personnage\Personnage.json` (`physique`), liées au Mii sur lequel elles ont été posées, et
s'appliquent à la fenêtre du Mii comme à OBS. Pour un objet accroché, activez-le (ou *👁 Tout montrer*) avant de cliquer.

## Suivi de la tête et des mains (webcam ou SteamVR)

Réglages → **Personnage** → carte **🎯 Suivi de la tête et des mains**, dans tous les modes sauf Debout (là, c'est
toujours le casque VR qui pilote le Mii) :

- **Source** : **📷 Webcam** ou **🥽 SteamVR**. Une seule à la fois : choisir SteamVR éteint la webcam, et inversement ;
- **La tête suit la vôtre** : la tête du Mii tourne, se lève et se penche comme la vôtre (ou comme le casque) ;
- **Les mains suivent vos mains** : la main du Mii va où est la vôtre (ou la manette), par rapport à vos épaules, à
  l'échelle de ses bras. Une main non suivie reprend en douceur son geste habituel (taper, frapper les bongos…) ; les
  animations restent prioritaires ;
- **Effet miroir** : le Mii bouge comme votre reflet au lieu de vous faire face ;
- **Caméra** (webcam) : « Automatique » prend la première vraie webcam (les caméras virtuelles comme OBS Virtual Camera
  sont ignorées), ou choisissez-en une. Un téléphone utilisé comme webcam (Camo…) marche aussi ;
- **Recentrer** : regardez votre écran et cliquez, pour régler le « tout droit » de la tête ;
- **La souris reste prioritaire** (mode clavier) : quand vous bougez la souris, ou que votre main revient à l'endroit où
  vous l'utilisez, la main du Mii repasse sur sa souris. Cet endroit est appris tout seul pendant que vous bougez la
  souris, et retenu pour la suite.

**Webcam** : placez-la face à vous, épaules dans le champ. Le visage donne l'orientation la plus précise ; s'il est caché
(casque VR sur la tête), la tête est estimée avec le nez et les oreilles.

**SteamVR** : lancez SteamVR avec le casque et les manettes allumés ; la tête suit le casque, les mains suivent les
manettes.

**Confidentialité** (webcam) : l'image n'est jamais affichée, ni enregistrée, ni envoyée sur Internet. Elle est analysée sur le PC
par [MediaPipe](https://ai.google.dev/edge/mediapipe) dans une fenêtre invisible qui n'a ni vidéo ni dessin, et seul le
mouvement (tête, mains) arrive au Mii. Les pages du Mii (fenêtre, OBS) n'ont pas accès à la caméra. La caméra s'éteint
dès que les deux options sont décochées, que SteamVR est choisi ou que le Mii n'est affiché nulle part.

## Mini Mii sur la manette

Réglages → **🎹 Instrument** → *Manette* → **🧑‍🤝‍🧑 Mini Mii sur la manette**. Au lieu du Mii qui tient la manette,
la manette se présente comme vous voyez la vôtre et six petites copies de votre Mii se tiennent dessus :

- une sur **chaque stick** : elle penche avec lui en écartant les bras, et s'accroupit quand vous cliquez le stick (L3 / R3) ;
- une sur **A B X Y**, une sur la **croix** : elles sautent sur la touche que vous appuyez et s'accroupissent pour l'enfoncer ;
- une sur **chaque gâchette** (LB / LT, RB / RT) ;
- les autres boutons (Vue, Menu, Accueil…) sont pris par le mini le plus proche.

Elles parlent et clignent des yeux avec le Mii, avec les mêmes expressions. Marche avec toutes les manettes, y compris
celles de l'éditeur de manettes. Un raccourci peut l'activer / le désactiver (page Raccourcis → *Mini Mii sur la manette*).

## Thème de l'interface

Réglages → **🎨 Thème** :

- **Classique** : l'apparence sombre d'origine ;
- **Wii** : fond gris clair rayé, panneaux blancs, gros boutons blancs bombés aux coins arrondis, champs de saisie comme la
  recherche de la Wii, sélection entourée de bleu, fond clair dans la vue 3D des éditeurs ;
  les emojis sont remplacés par des **icônes grises au trait épais et arrondi** (dessins originaux de l'appli, dans
  l'esprit des menus de la console : dossier, maison, clé, manette, crayon, corbeille…) ;
- **Carnet** : comme un carnet tenu à la main. Papier crème à petits points, encre brun-noir, boutons découpés au contour
  tracé à main levée avec une petite ombre décalée, coup de surligneur jaune sur ce qui est choisi, titres écrits à la main
  et soulignés au crayon rouge, bouts de ruban adhésif sur les cartes, champs « sur la ligne », pense-bêtes pour les états,
  et les mêmes icônes repassées au crayon. Le menu de l'icône passe aussi en papier et surligneur ;
- **Notice** : change aussi la **disposition**, comme une notice imprimée. Les pages passent en **onglets numérotés** en
  haut, chaque page a son grand titre, et les cartes deviennent des **sections numérotées** séparées par un filet, titre à
  gauche et réglages à droite. Les interrupteurs deviennent des **cases à cocher**, les choix des **boutons accolés**, et
  les modes de l'instrument une liste à cocher. Plus d'emojis dans les libellés (seuls les boutons à icône gardent une
  icône au trait fin). Les éditeurs se rangent en **panneaux collés aux bords**, avec une barre d'outils en haut et une
  barre d'aide en bas (survolez-la pour la lire en entier). Les raccourcis vers les éditeurs passent dans la barre du bas ;
- **Windows** : dans l'esprit de l'application Paramètres. Fond « Mica », accent bleu, interrupteurs et champs façon
  Windows 11, une fine barre de titre, un bloc profil et une **barre de recherche** en haut de la liste (tapez « micro »,
  « OBS », « raccourci »… : la bonne page s'ouvre et les cartes trouvées sont entourées), un grand titre de page et les
  réglages en cartes pleine largeur. Dans les éditeurs, panneaux ancrés aux bords, barre de commandes et onglets
  soulignés de bleu ;
- **Xbox** : sombre et vert, avatar rond, **horloge** en haut, les pages en **pastilles** sur une ligne (la page ouverte
  en blanc), contour blanc lumineux au survol et grandes tuiles pour l'instrument ;
- **Switch** : gris clair, cartes blanches très arrondies, boutons en pastilles, la sélection **entourée de cyan qui
  pulse**, horloge et batterie en haut, les pages en **icônes rondes centrées en bas** (le nom de la page apparaît
  au-dessus) et une barre « Ⓑ Retour · Ⓐ OK ».

- **PlayStation** : bleu nuit en dégradé, panneaux en verre, boutons en pastilles blanches au survol lumineux, avatar et
  horloge en haut à droite, et les pages en **tuiles carrées** sur une ligne : la tuile choisie grandit, entourée de
  blanc, avec son nom à côté.

L'interrupteur **🌙 Version sombre** (page Thème) passe Wii, Windows et Switch en sombre : Wii gris anthracite rayé,
Windows en mode sombre de Windows 11 (accent bleu clair), Switch en gris foncé avec le contour cyan. Chaque thème a
aussi son menu du clic droit sur l'icône, assorti (et sombre quand la version sombre est choisie).

Il s'applique à la fenêtre de réglages, aux trois éditeurs (scène, personnage, manettes) et au menu du clic droit sur l'icône,
tout de suite, y compris aux fenêtres déjà ouvertes. Le Mii, sa fenêtre et OBS ne changent pas.

## Raccourcis clavier

Réglages → page **⌨️ Raccourcis** : tous les raccourcis de l'appli au même endroit.

- **Nouveau raccourci** : choisissez une action (*Instrument suivant*, *Instrument : manette*, *Afficher / masquer la fenêtre du Mii*,
  *Cadrage buste ↔ corps entier*, *Vue orbitale*, *Décor*, *Scène : préréglage suivant / précédent / <nom>*, *Micro*,
  *Désactiver tous les extras*, *Manette : …*, *Fluidité…*,
  *Recharger*…), cliquez sur **⌨ Choisir la touche…** puis appuyez sur la combinaison (Échap pour annuler).
- **Touches qu'on ne peut pas appuyer** (F13 à F24 des claviers macro / Stream Deck, etc.) : pendant le choix de la touche,
  cochez Ctrl / Alt / Maj / Win et choisissez-la dans la liste (F1…F24, boutons de souris, pavé numérique, touches multimédia…).
- **Boutons de la souris** : les boutons latéraux (*Souris4*, *Souris5*) et le clic molette (*SourisMilieu*) marchent aussi.
- **✨ Ajouter des exemples** : Ctrl+Maj+F9 (instrument suivant), Ctrl+Maj+F10 (afficher / masquer la fenêtre),
  Ctrl+Maj+F11 (désactiver tous les extras).
- Les raccourcis des **extras du personnage** sont aussi listés : changer la combinaison, la supprimer, choisir *Appuyer* ou *Maintenir*.
- Une combinaison utilisée deux fois est signalée (⚠) : les deux actions se déclencheraient ensemble.
- **Raccourcis activés** : un interrupteur pour tous les couper, par exemple le temps d'une partie.

Les raccourcis marchent même quand un jeu est au premier plan et ne bloquent pas la touche. Ils sont enregistrés dans
`settings.json` (ceux des extras dans `Personnage\Personnage.json`).

## Ajouter d'autres Mii

Déposez vos modèles dans le dossier **`Mii`** (bouton 📁 de la section Personnage), puis *↻ Actualiser les listes*.
Un modèle avec un squelette de Mii (os `Arm_1_L/R`, `Arm_2_L/R`, `Wrist_L/R`, `Head`, `Spine_1`, comme ceux exportés
depuis Miitopia / Tomodachi) est reconnu tout seul : un `.fbx` ou un `.dae` exporté avec ces os marche comme un `.glb`.

## Autres personnages 3D (Mixamo, VRoid, Blender…)

Le **Mii reste le personnage conseillé** : c'est pour lui que tout est réglé (visage animé, proportions, objets
d'exemple). Mais n'importe quel modèle 3D **riggé** (avec un squelette) peut aussi prendre sa place : déposez-le dans le
dossier `Mii` et choisissez-le dans *Réglages → Personnage*. Il tape au clavier, joue des bongos, tient la manette ou le
volant, porte le casque VR, suit la webcam / SteamVR, joue les animations et porte les objets accrochés, comme le Mii.

**Os reconnus tout seuls** : l'appli lit les noms des os des conventions courantes et devine le reste par la forme du
squelette :

| Origine | Exemple de noms |
|---|---|
| Mixamo | `mixamorig:LeftArm`, `mixamorig:LeftForeArm`, `mixamorig:LeftHand`, `mixamorig:Head` |
| VRoid / VRM | `J_Bip_L_UpperArm`, `J_Bip_L_LowerArm`, `J_Bip_L_Hand`, `J_Bip_C_Head` |
| Blender (Rigify, métarig) | `upper_arm.L`, `forearm.L`, `hand.L` (les os `DEF-` sont préférés) |
| Unreal / Unity | `upperarm_l`, `lowerarm_l`, `hand_l`, `thigh_l`, `calf_l` · `LeftUpperArm`, `LeftHand` |
| 3ds Max (Biped), Character Creator | `Bip01 L UpperArm` · `CC_Base_L_Upperarm` |

Le sens du modèle est deviné aussi (un modèle VRoid, qui regarde vers l'arrière, est retourné tout seul).

**Vérifier ou corriger les os : éditeur de personnage → 🦴 Squelette.** Pour chaque rôle (tête, bas du dos, poitrine,
bassin, mâchoire, bouche, bras, avant-bras, mains, cuisses, jambes, pieds), choisissez l'os dans la liste, ou cliquez 🎯 puis sur le
modèle pour prendre l'os le plus proche. « Gauche » veut dire la gauche **du personnage**. Les points de couleur montrent
le résultat sur le modèle (bleu = gauche, orange = droite, jaune = tête et dos).
- **↩ Le modèle regarde vers l'arrière** : le tourne de 180° si l'appli s'est trompée de sens.
- **💾 Enregistrer et recharger** : le réglage est gardé dans `Mii\<nom du modèle>.os.json` (à garder avec le modèle si
  vous le partagez), puis la fenêtre et OBS se rechargent.
- **✨ Détection auto** remet ce que l'appli avait reconnu, **↺ Oublier le réglage** met le fichier `.os.json` à la
  corbeille.

Si des os obligatoires manquent, le personnage ne bouge pas (message « squelette à régler ») et l'éditeur de personnage
s'ouvre directement sur 🦴 Squelette. Les jambes ne servent que pour la chaise, le volant et le cinéma.

**👄 Mâchoire, 👄 Bouche (haut) et 👄 Bouche (bas) (facultatifs)** : si le modèle a ces os, ils sont reconnus tout seuls
et **la bouche bouge quand vous parlez au micro**, plus ou moins selon le volume de votre voix :
- la mâchoire (`Jaw`, `mixamorig:Jaw`, `CC_Base_JawRoot`…) et le bas de la bouche (`LowerMouth`, `mouth_lower`,
  `lip_lower`, `LowerLip`, `lowerJaw`…) s'ouvrent vers le bas ;
- le haut de la bouche (`UpperMouth`, `mouth_upper`, `lip_upper`, `UpperLip`, `upperJaw`…) se soulève un peu.

Un seul de ces os suffit. Si le bas de la bouche est accroché à la mâchoire, seule la mâchoire s'ouvre (la bouche ne
s'ouvre pas deux fois plus). Les coins des lèvres (os gauche / droite) ne sont pas utilisés. Choisissez *— aucun —* dans
🦴 Squelette pour garder la bouche fermée.

Bon à savoir :
- Le **visage animé** (bouches dessinées qui parlent, clignement des yeux, expressions) ne marche que sur les Mii. Les
  autres modèles parlent seulement avec leurs os de mâchoire ou de bouche, s'ils en ont.
- Les objets et animations faits pour le Mii (grosse tête, petits bras) peuvent demander d'être replacés : réglez-les
  dans l'éditeur de personnage, avec *Seulement ce Mii* si besoin.
- Le modèle est mis à l'échelle de la scène du Mii : il est agrandi ou rapetissé pour que ses mains arrivent sur la
  même table que le Mii. La table, le tapis de souris, les écrans du décor et vos objets restent donc à la même place
  qu'avec le Mii. Un modèle en centimètres (Mixamo) marche tel quel.
- Plus ses bras sont longs par rapport à sa taille (Minecraft, personnage réaliste), plus la table arrive bas sur son
  corps, et ses coudes restent le long du corps : la pose des bras est plus naturelle. Le Mii garde exactement sa pose.
- Le bureau est à la taille du personnage : la table, le clavier, le tapis et la souris sont plus petits que ceux du
  Mii (taille réglée sur ses bras), le clavier et le tapis sont rapprochés devant lui, et la table est juste assez
  large pour eux. Vos
  réglages de la table et du tapis (largeur, profondeur, place, matière) s'appliquent par-dessus, et vos objets ne
  bougent pas : un objet posé au bord d'une table plus petite peut donc dépasser.
- Un `.vrm` est un `.glb` : renommez-le en `.glb`.

## Formats 3D acceptés

Partout où l'appli prend un modèle 3D (dossiers `Mii`, `Objets`, `Personnage\Accessoires`, `Manettes`) :

| Format | Remarques |
|---|---|
| `.glb` | le plus simple : un seul fichier, textures comprises |
| `.gltf` | avec ses fichiers `.bin` et ses images posés à côté |
| `.fbx` | textures intégrées, ou images posées à côté (même si le fichier pointe vers un autre disque, l'image du même nom est retrouvée) |
| `.obj` | avec son `.mtl` et ses images posés à côté |
| `.dae` (Collada) | images à côté ou dans un sous-dossier |
| `.stl`, `.ply` | formes sans texture (impression 3D, scans) ; gris clair, ou les couleurs du fichier pour un `.ply` |
| `.3mf` | impression 3D |
| **`.zip`** | **un modèle téléchargé tel quel** : l'appli ouvre le zip, y trouve le modèle (glb, gltf, fbx, dae, obj, 3mf, stl ou ply, même dans un sous-dossier) et ses textures (sous-dossiers `Textures`… compris) |

Le plus pratique pour un modèle trouvé sur internet (Sketchfab, etc.) : déposez directement son **.zip**, sans le
décompresser. Les modèles sont remis à la bonne taille automatiquement (objets de scène, accessoires).

**Boutons 📥 Importer** : plus besoin de déplacer les fichiers à la main. Partout où l'appli prend un fichier, un bouton
📥 ouvre l'explorateur et **copie** le fichier choisi dans le bon dossier (sans écraser : un nom libre est choisi) :

| Où | Ce qui est importé |
|---|---|
| Réglages → Personnage → Mii 📥 | un Mii (dossier `Mii`) |
| Réglages → Personnage → Visage 📥 | un dossier de visage (`Visages`) |
| Réglages → Décor & scène, éditeur de scène | des images (`Images`) et des modèles 3D (`Objets`) |
| Éditeur de personnage | des images d'expression (`Personnage\Expressions`) et des modèles à accrocher (`Personnage\Accessoires`) |
| Éditeur de manettes | un modèle 3D de manette (`Manettes`) |

Un modèle qui a besoin d'autres fichiers (`.obj` avec son `.mtl`, `.fbx` / `.dae` avec leurs textures, `.gltf` avec son
`.bin`) est rangé avec eux dans un **.zip** : l'appli lit le modèle, retrouve les fichiers qu'il utilise (à côté, dans un
sous-dossier ou dans un dossier `Textures` voisin) et les emporte.
Pour le personnage, le plus simple est un Mii (squelette de Mii, comme les modèles exportés depuis Miitopia / Tomodachi) ;
les autres modèles riggés marchent aussi (voir *Autres personnages 3D*).

## Confidentialité

- Le serveur n'écoute que sur `localhost`, et le flux d'événements n'accepte que la page de l'appli
  (un site web ouvert dans votre navigateur ne peut pas s'y connecter).
- L'appli transmet la *position* approximative des touches (pour animer la main), jamais les caractères.
- Les raccourcis du personnage sont reconnus dans l'appli elle-même : les pages ne reçoivent que la liste des ajouts actifs.

## Développement

`http://localhost:7878/api/status` indique le mode, le nombre de pages qui affichent le Mii et
l'état du volant, de la manette et du casque.

Sources : `D:\Mii\Code source` (projet `SullysMiiBongo.csproj`).

```
dotnet build
"bin\Debug\net10.0-windows\Sully's Mii-Bongo.exe" --root wwwroot
```

`--root` sert les fichiers web directement depuis les sources (et prend les dossiers `Mii` et `Visages` des
sources) : modifiez `wwwroot/app.js`, puis *Recharger*. Sans `--root`, les pages intégrées au .exe sont utilisées.
Le port se change dans `%APPDATA%\Sully's Mii-Bongo\settings.json`.

Pages : `wwwroot/app.js` (scène, Mii), `wwwroot/scene-objects.js` (formes et textures de l'éditeur, partagées),
`wwwroot/editor.js` (interface de l'éditeur, chargée avec `?editor=1`), `wwwroot/pad-profile.js` (manettes
personnalisées : chargement, découpe en pièces, formes, mouvements) et `wwwroot/manettes.html` + `pad-editor.js`
(éditeur de manettes).

Publier l'appli (un seul .exe + `Mii`, `Visages`, `Images`, `Objets`, `Lisez-moi.md`, `Licences`) :

```
dotnet publish -c Release -r win-x64 --self-contained false -o "D:\Mii\Sully%27s Mii-Bongo"
```

(`%27` = l'apostrophe : MSBuild ne l'accepte pas telle quelle dans le dossier de sortie.)

Icône : `assets/MiiBongo.ico` (16 à 256 px), rendue depuis le modèle 3D du Mii (`assets/mii-icon-1024.png`).
Rendu 3D : [three.js](https://threejs.org) r160 (licence MIT, inclus dans `wwwroot/vendor`).
Audio : [NAudio](https://github.com/naudio/NAudio) (licence MIT).
VR : [OpenVR](https://github.com/ValveSoftware/openvr) v2.5.1 de Valve (licence BSD-3, dans `OpenVR/`).
Suivi webcam : [MediaPipe Tasks Vision](https://github.com/google-ai-edge/mediapipe) 0.10.21 et ses modèles Pose Landmarker lite et Face Landmarker de Google (licence Apache 2.0, dans `wwwroot/vendor/mediapipe`).

Pour tester le mode VR sans casque : ouvrez `http://localhost:7878/?mode=vr&bg=dark`,
puis tapez `mii.simVR()` dans la console du navigateur (F12).
Même principe pour le volant : `?mode=wheel` puis `mii.simWheel()`, et pour la manette : `?mode=pad` puis `mii.simPad()`.
Modèle de manette : [« 8BitDo Ultimate 2C Controller — Low Poly »](https://sketchfab.com/3d-models/8bitdo-ultimate-2c-controller-low-poly-ae49e071dc174f008940ed59d1eebb9c)
par [Isshan](https://sketchfab.com/isshanmarwah), licence [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) —
recoloré et découpé en pièces mobiles au chargement.
Modèle de manette Xbox : [« Chou1 »](https://sketchfab.com/3d-models/chou1-ba435f0822f645459ba87840eef254ae)
par [hchou](https://sketchfab.com/hchou), licence [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) —
redressé, texture nettoyée et réduite (`wwwroot/props/manette_xbox.glb`), découpé en pièces mobiles au chargement ;
la version 25 ans est recolorée par l'appli (aucune image ajoutée).
Manettes PlayStation lues avec [HidSharp](https://www.zer7.com/software/hidsharp) (licence Apache 2.0).
Volant lu avec [Vortice.DirectInput](https://github.com/amerkoleci/Vortice.Windows) (licence MIT).
