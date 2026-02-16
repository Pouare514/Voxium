# Discord2

Clone Discord-like (chat texte/voice + rôles + modération) construit avec:
- Backend Rust (`actix-web` + `sqlx` + SQLite)
- Frontend Tauri + HTML/CSS/JS

---

## Sommaire
- [Fonctionnalités](#fonctionnalités)
- [Roadmap](#roadmap)
- [Prérequis](#prérequis)
- [Setup rapide (local)](#setup-rapide-local)
- [Utiliser avec des amis (réseau)](#utiliser-avec-des-amis-réseau)
- [Rôles & administration](#rôles--administration)
- [Contribuer](#contribuer)
- [Dépannage](#dépannage)

---

## Fonctionnalités
- Authentification (inscription/connexion)
- Salons textuels et vocaux
- Messages temps réel via WebSocket
- Uploads d’images
- Réponses (reply), épingles (pins), recherche avancée
- Rôles serveur + permissions par salon
- Paramètres serveur/salon côté interface

---

## Roadmap

### Court terme
- Stabilisation multi-utilisateurs sur réseau local/Internet
- Paramètres salon/serveur encore plus rapides (UX admin)
- Meilleure config de build Tauri pour packaging propre

### Moyen terme
- Notifications plus robustes (mentions, présence, activité)
- Outils de modération avancés (logs, actions groupées)
- Amélioration perf DB et pagination des messages

### Exploratoire
- **Compatibilité “client custom” avec APIs Discord ** (preview)
	- uniquement si c’est faisable proprement
	- pas activé par défaut dans le projet
---

## Prérequis

### Outils
- `Rust` (stable)
- `Node.js` (LTS recommandé)
- `npm`

### Windows (Tauri)
- `WebView2 Runtime`
- Build tools C++ (Visual Studio Build Tools)

> Le backend écoute par défaut sur `0.0.0.0:8080`.

---

## Setup rapide (local)

### 1) Cloner le repo
```bash
git clone https://github.com/Pouare514/discord2.git
cd discord2
```

### 2) Installer la partie frontend
```bash
cd discord-app
npm install
cd ..
```

### 3) (Optionnel) Configurer `.env`
Le backend lit `.env` (optionnel) à la racine du workspace.

Exemple:
```env
PORT=8080
JWT_SECRET=change-me
DATABASE_URL=sqlite:discord2.db
```

Sans `.env`, la DB par défaut sera créée automatiquement: `sqlite:discord2.db`.

### 4) Lancer l’app
Option A (Windows):
```bat
launch.bat
```

Option B (manuel, 2 terminaux):

Terminal 1:
```bash
cd backend
cargo run --bin backend
```

Terminal 2:
```bash
cd discord-app
npm run tauri dev
```

---

## Utiliser avec des amis (réseau)

Par défaut, le frontend pointe vers `127.0.0.1` (localhost), donc **chaque ami doit pointer vers l’IP du serveur**.

### 1) Héberger le backend sur une machine “serveur”
Sur la machine hôte:
```bash
cd backend
cargo run --bin backend
```
Ouvrir le port `8080` dans le pare-feu/routeur si nécessaire.

### 2) Pointer les clients vers l’IP du serveur
Dans `discord-app/src/main.js`, modifier:
```js
const API = "http://127.0.0.1:8080";
const WS_URL = "ws://127.0.0.1:8080/ws";
```
par l’IP LAN/WAN du serveur, ex:
```js
const API = "http://192.168.1.42:8080";
const WS_URL = "ws://192.168.1.42:8080/ws";
```

### 3) Adapter CSP Tauri
Le fichier `discord-app/src-tauri/tauri.conf.json` contient aussi `127.0.0.1` dans `connect-src`.
Remplace-la par l’IP utilisée, sinon les connexions peuvent être bloquées.

### 4) Lancer le client chez les amis
```bash
cd discord-app
npm install
npm run tauri dev
```

---

## Rôles & administration

### Promouvoir un utilisateur admin
Option 1 (UI): via menu contextuel membre (si vous êtes déjà admin).

Option 2 (CLI):
```bat
make_admin.bat
```
Puis saisir le pseudo dans le terminal.

### Paramètres serveur/salon
- **Paramètres serveur**: création/suppression de rôles + attribution
- **Paramètres salon** (clic droit): nom, type, rôle requis, mode public/privé

---

## Contribuer

Merci a ceux qui vont contribuer ❤️

Que ce soit une grosse feature, un fix, une idée UX ou même une typo, c’est bienvenu.

### Workflow simple
1. Fork/clone puis crée une branche:
```bash
git checkout -b feat/ma-feature
```
2. Fais ton changement (petit et ciblé si possible)
3. Vérifie rapidement:
```bash
cargo check -p backend
node --check discord-app/src/main.js
```
4. Commit avec un message clair:
```bash
git add .
git commit -m "feat: ajoute ..."
```
5. Push + Pull Request

### Guide (important)
- Garde les changements lisibles et dans le scope de la PR
- Explique le “pourquoi” dans la description de PR (2-3 lignes suffisent)
- Si tu touches à l’UX, ajoute une capture/vidéo courte
- Si tu modifies les rôles/permissions, précise les cas testés
- Si tu as un doute sur une direction, ouvre une issue/discussion avant gros refactor

---

## Dépannage

### `npm run build` échoue avec `frontendDist includes ["node_modules", "src-tauri"]`
C’est lié à la config Tauri actuelle (`frontendDist: "../"`).
Pour dev local, utilisez `npm run tauri dev`.

### Le client ne se connecte pas au backend
- Vérifier `API` / `WS_URL` dans `discord-app/src/main.js`
- Vérifier la CSP dans `discord-app/src-tauri/tauri.conf.json`
- Vérifier port/pare-feu (`8080`)

### Erreur DB
- Vérifier `DATABASE_URL`
- Supprimer/recréer le fichier SQLite local si vous êtes en dev et que vous pouvez reset

---

## Structure utile
- `backend/`: API Rust + WebSocket + DB
- `discord-app/`: client Tauri (UI)
- `migrations/`: scripts SQL appliqués au démarrage
- `uploads/`: fichiers uploadés

