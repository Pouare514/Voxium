# README Déploiement VPS

Guide de déploiement de Voxium sur VPS avec:

- backend Rust en service systemd
- reverse proxy Nginx
- TLS pour HTTPS/WSS
- option tunnel (Cloudflare Tunnel) si tu ne veux pas exposer de port public

---

## 1) Architecture cible

- Backend Voxium écoute en local sur `127.0.0.1:8080`
- Nginx expose `https://chat.ton-domaine.com`
- WebSocket passe via Nginx (`wss://chat.ton-domaine.com/ws`)
- DB SQLite stockée sur le VPS

---

## 2) Pré-requis VPS

Exemple: Ubuntu 22.04/24.04

```bash
sudo apt update
sudo apt install -y git curl build-essential pkg-config libssl-dev nginx
```

Installer Rust:

```bash
curl https://sh.rustup.rs -sSf | sh
source $HOME/.cargo/env
```

---

## 3) Récupérer et build le projet

```bash
cd /opt
sudo git clone https://github.com/Pouare514/discord2.git voxium
sudo chown -R $USER:$USER /opt/voxium
cd /opt/voxium
cargo build --release -p backend
```

Binaire backend généré ici:

- `/opt/voxium/target/release/backend`

---

## 4) Variables d’environnement backend

Créer un fichier env dédié au service:

```bash
sudo mkdir -p /etc/voxium
sudo nano /etc/voxium/backend.env
```

Contenu recommandé:

```env
PORT=8080
JWT_SECRET=change-moi-avec-une-vraie-cle-longue
DATABASE_URL=sqlite:/opt/voxium/voxium.db
```

Créer dossier uploads (si besoin):

```bash
mkdir -p /opt/voxium/uploads
```

---

## 5) Service systemd

Créer le service:

```bash
sudo nano /etc/systemd/system/voxium-backend.service
```

Contenu:

```ini
[Unit]
Description=Voxium Backend
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/voxium
EnvironmentFile=/etc/voxium/backend.env
ExecStart=/opt/voxium/target/release/backend
Restart=always
RestartSec=3

# Durcissement basique
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=/opt/voxium

[Install]
WantedBy=multi-user.target
```

Activer et démarrer:

```bash
sudo systemctl daemon-reload
sudo systemctl enable voxium-backend
sudo systemctl start voxium-backend
sudo systemctl status voxium-backend
```

Logs live:

```bash
sudo journalctl -u voxium-backend -f
```

---

## 6) Nginx (HTTP + WebSocket)

Créer la conf Nginx:

```bash
sudo nano /etc/nginx/sites-available/voxium
```

Contenu:

```nginx
server {
    listen 80;
    server_name chat.ton-domaine.com;

    client_max_body_size 25M;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /ws {
        proxy_pass http://127.0.0.1:8080/ws;
        proxy_http_version 1.1;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_read_timeout 3600;
        proxy_send_timeout 3600;
    }
}
```

Activer:

```bash
sudo ln -s /etc/nginx/sites-available/voxium /etc/nginx/sites-enabled/voxium
sudo nginx -t
sudo systemctl reload nginx
```

---

## 7) TLS (HTTPS + WSS)

### Option A — Let’s Encrypt (recommandé si domaine public)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d chat.ton-domaine.com
```

Après ça, ton endpoint sera:

- API: `https://chat.ton-domaine.com`
- WS: `wss://chat.ton-domaine.com/ws`

---

## 8) Option Tunnel TLS/WSS (Cloudflare Tunnel)

Utilise cette option si tu ne veux pas ouvrir les ports entrants sur le VPS.

### 8.1 Installer cloudflared

```bash
# Exemple Ubuntu/Debian
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo gpg --dearmor -o /usr/share/keyrings/cloudflare-main.gpg
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update
sudo apt install -y cloudflared
```

### 8.2 Login + création tunnel

```bash
cloudflared tunnel loginV
cloudflared tunnel create voxium
```

### 8.3 Config tunnel

```bash
sudo mkdir -p /etc/cloudflared
sudo nano /etc/cloudflared/config.yml
```

Exemple:

```yaml
tunnel: voxium
credentials-file: /home/ubuntu/.cloudflared/<UUID_DU_TUNNEL>.json

ingress:
  - hostname: chat.ton-domaine.com
    service: http://127.0.0.1:80
  - service: http_status:404
```

### 8.4 Route DNS + service

```bash
cloudflared tunnel route dns voxium chat.ton-domaine.com
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
```

Avec Cloudflare, TLS est géré côté edge, et tu gardes `https/wss` côté clients.

---

## 9) Config client Voxium (important)

Le client actuel utilise des URLs codées en dur dans `discord-app/src/main.js`.

Modifier:

```js
const API = "http://127.0.0.1:8080";
const WS_URL = "ws://127.0.0.1:8080/ws";
```

En prod:

```js
const API = "https://chat.ton-domaine.com";
const WS_URL = "wss://chat.ton-domaine.com/ws";
```

Aussi adapter la CSP dans `discord-app/src-tauri/tauri.conf.json` (`connect-src`) pour ton domaine.

---

## 10) Mise à jour applicative

```bash
cd /opt/voxium
git pull
cargo build --release -p backend
sudo systemctl restart voxium-backend
sudo systemctl status voxium-backend
```

---

## 11) Vérifications rapides

API:

```bash
curl -i https://chat.ton-domaine.com/api/health
```

WebSocket (test simple):

- ouvrir l’app et vérifier que la connexion WS est stable
- vérifier les logs backend en parallèle:

```bash
sudo journalctl -u voxium-backend -f
```

---

## 12) Bonnes pratiques sécurité (minimum)

- Mets un vrai `JWT_SECRET` long et unique
- Sauvegarde régulière de `voxium.db` + dossier `uploads/`
- N’exécute pas le backend en root
- Limite les ports ouverts (`80/443` seulement si possible)
- Active fail2ban/ufw selon ton infra

---

## 13) Backup simple

```bash
mkdir -p /opt/voxium/backups
cp /opt/voxium/voxium.db /opt/voxium/backups/voxium-$(date +%F-%H%M).db
```

Tu peux cronifier ce backup + sync externe (S3, rsync, etc.).

---

Si tu veux, je peux te préparer une version **docker-compose** (backend + nginx + volume DB + uploads) pour simplifier encore le déploiement.

