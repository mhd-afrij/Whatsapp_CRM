# VM Setup & Deployment Guide

This guide walks through configuring a Linux Virtual Machine (VPS / Cloud VM like AWS EC2, DigitalOcean Droplet, Hetzner, Linode, or Azure VM) for the **CRM-WhatsApp** platform.

It covers two deployment architectures:
- **[Architecture A: Full-Stack Deployment](#architecture-a-full-stack-deployment-on-vm)** — Run frontend, backend, WhatsApp gateway, Redis, and MySQL together on the VM using Docker Compose.
- **[Architecture B: Dedicated Database Host](#architecture-b-vm-as-a-dedicated-mysql-host-for-render)** — Run MySQL 8 on the VM to serve an external deployment (such as Render).

---

## 1. System Requirements & Prerequisites

### Recommended Specifications

| Component | Minimum | Recommended (Production) |
| :--- | :--- | :--- |
| **Operating System** | Ubuntu 22.04 / 24.04 LTS (x86_64) | Ubuntu 24.04 LTS |
| **vCPU** | 2 cores | 4 cores |
| **RAM** | 4 GB | 8 GB |
| **Disk Space** | 25 GB SSD | 50+ GB SSD (NVMe preferred) |
| **Network** | Static Public IPv4, Ports 80, 443, 22 open | Static Public IPv4 + Domain DNS A record |

---

## 2. Server Preparation & Hardening

Connect to your freshly provisioned VM via SSH:

```bash
ssh root@<YOUR_VM_IP>
```

### 2.1 Update System Packages
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git ufw fail2ban unzip ca-certificates gnupg lsb-release
```

### 2.2 Create a Non-Root Admin User
```bash
adduser deployer
usermod -aG sudo deployer
```

*(Optional but recommended)* Copy your SSH authorized keys to the new user:
```bash
mkdir -p /home/deployer/.ssh
cp /root/.ssh/authorized_keys /home/deployer/.ssh/
chown -R deployer:deployer /home/deployer/.ssh
chmod 700 /home/deployer/.ssh
chmod 600 /home/deployer/.ssh/authorized_keys
```

Log out and reconnect as `deployer`:
```bash
ssh deployer@<YOUR_VM_IP>
```

### 2.3 Configure Firewall (UFW)
```bash
# Allow SSH first so you do not lock yourself out!
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Check status:
```bash
sudo ufw status verbose
```

---

## 3. Install Docker & Docker Compose

Install the latest official Docker Engine on Ubuntu:

```bash
# 1. Add Docker official GPG key
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

# 2. Add repository to Apt sources
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# 3. Install Docker packages
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 4. Enable non-root docker access
sudo usermod -aG docker $USER
newgrp docker

# 5. Verify installation
docker --version
docker compose version
```

---

## Architecture A: Full-Stack Deployment on VM

In this setup, the entire CRM application (Frontend, Laravel Backend API & Queue Worker, WhatsApp Baileys Gateway, Redis, MySQL, and Nginx reverse proxy) runs as a unified containerized stack.

### Step 1: Clone the Repository
```bash
cd /home/deployer
git clone <YOUR_GIT_REPOSITORY_URL> crm-whatsapp
cd crm-whatsapp
```

### Step 2: Initialize Environment Configuration Files
```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
cp whatsapp-gateway/.env.example whatsapp-gateway/.env
```

### Step 3: Generate Security Keys & Tokens
Generate the required cryptographic keys:

```bash
# 1. Generate 32-byte hex key for WhatsApp session encryption (64 hex characters):
openssl rand -hex 32

# 2. Generate two random secrets for internal backend <-> gateway communication:
openssl rand -hex 24
openssl rand -hex 24

# 3. Generate Laravel Application Key:
# (If PHP is not installed natively, generate inside an ephemeral container)
docker run --rm -v $(pwd)/backend:/app -w /app php:8.2-cli php -r "echo 'base64:'.base64_encode(random_bytes(32)).PHP_EOL;"
```

### Step 4: Configure Environment Files

#### 1. Root `.env` (Used by Docker Compose for orchestration & shared envs)
Edit `.env`:
```bash
nano .env
```
Ensure key values are filled in:
```env
APP_ENV=production
FRONTEND_URL=https://crm.yourdomain.com
NEXT_PUBLIC_APP_URL=https://crm.yourdomain.com
NEXT_PUBLIC_API_URL=https://crm.yourdomain.com/api/v1
NEXT_PUBLIC_SOCKET_URL=https://crm.yourdomain.com
SOCKET_CORS_ORIGIN=https://crm.yourdomain.com

# Database Credentials
DB_DATABASE=crm_whatsapp
DB_USERNAME=crm_user
DB_PASSWORD=YOUR_STRONG_DB_PASSWORD
MYSQL_ROOT_PASSWORD=YOUR_STRONG_ROOT_PASSWORD

# Shared Gateway & Backend Keys (MUST match exactly)
INTERNAL_GATEWAY_TOKEN=paste_generated_token_1_here
INTERNAL_SHARED_SECRET=paste_generated_token_2_here
CREDENTIALS_ENCRYPTION_KEY=paste_64_char_hex_key_here

# Azure Blob Storage (for persistent media & logos)
STORAGE_PROVIDER=azure
FILESYSTEM_DISK=azure
AZURE_STORAGE_ACCOUNT_NAME=your_storage_account
AZURE_STORAGE_ACCOUNT_KEY=your_storage_key
AZURE_STORAGE_CONTAINER_NAME=whatsapp-media
AZURE_STORAGE_URL=https://your_storage_account.blob.core.windows.net
```

#### 2. Backend `backend/.env`
Ensure:
```env
APP_NAME="CRM WhatsApp"
APP_ENV=production
APP_KEY=base64:your_generated_app_key_here
APP_DEBUG=false
APP_URL=https://crm.yourdomain.com

DB_CONNECTION=mysql
DB_HOST=mysql
DB_PORT=3306
DB_DATABASE=crm_whatsapp
DB_USERNAME=crm_user
DB_PASSWORD=YOUR_STRONG_DB_PASSWORD

REDIS_HOST=redis
REDIS_PORT=6379
QUEUE_CONNECTION=redis
CACHE_STORE=redis

WHATSAPP_GATEWAY_URL=http://whatsapp-gateway:4000
WHATSAPP_GATEWAY_TOKEN=paste_generated_token_1_here
INTERNAL_SHARED_SECRET=paste_generated_token_2_here
```

### Step 5: Build and Run Containers
```bash
# Validate compose config
docker compose -f docker-compose.yml -f docker-compose.production.yml config

# Build and start services in background
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --build
```

### Step 6: Run Database Migrations
```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml exec -T backend php artisan migrate --force
```

### Step 7: Verify Stack Health
```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml ps
curl -f http://localhost:8080/api/v1/health
curl -f http://localhost:8080/healthz
```

### Step 8: SSL/TLS Setup with Let's Encrypt (Certbot)
To terminate TLS on your domain (`crm.yourdomain.com`):

1. Install Certbot:
   ```bash
   sudo apt install -y certbot
   ```
2. Temporarily stop port 80/nginx container or use standalone mode:
   ```bash
   sudo certbot certonly --standalone -d crm.yourdomain.com
   ```
3. Copy or mount certificates to `infrastructure/nginx/certs/`:
   ```bash
   mkdir -p infrastructure/nginx/certs
   sudo cp /etc/letsencrypt/live/crm.yourdomain.com/fullchain.pem infrastructure/nginx/certs/cert.pem
   sudo cp /etc/letsencrypt/live/crm.yourdomain.com/privkey.pem infrastructure/nginx/certs/key.pem
   sudo chown -R deployer:deployer infrastructure/nginx/certs
   ```
4. Restart Nginx service:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.production.yml restart nginx
   ```

---

## Architecture B: VM as a Dedicated MySQL Host (for Render)

Use this setup if your application services (frontend, backend, gateway, redis) are hosted on **Render** (via `render.yaml`), and you are using this VM exclusively as a high-performance, persistent MySQL database.

### Step 1: Install MySQL Server 8
```bash
sudo apt update
sudo apt install -y mysql-server
```

### Step 2: Run Security Script
```bash
sudo mysql_secure_installation
```
Follow prompts to set password validation policy and remove anonymous users/test database.

### Step 3: Configure Remote Network Access
Edit MySQL configuration:
```bash
sudo nano /etc/mysql/mysql.conf.d/mysqld.cnf
```
Change `bind-address`:
```ini
bind-address            = 0.0.0.0
# Optional: explicitly specify port
port                    = 3306
```

Restart MySQL service:
```bash
sudo systemctl restart mysql
sudo systemctl enable mysql
```

### Step 4: Create Database and User
Log in to MySQL as root:
```bash
sudo mysql -u root -p
```
Run the following SQL commands:
```sql
-- 1. Create database with UTF8MB4 charset
CREATE DATABASE crm_whatsapp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2. Create remote user (replace with a secure password)
CREATE USER 'crm_user'@'%' IDENTIFIED BY 'StrongSecurePassword123!';

-- 3. Grant privileges
GRANT ALL PRIVILEGES ON crm_whatsapp.* TO 'crm_user'@'%';
FLUSH PRIVILEGES;

-- 4. Verify user exists
SELECT user, host FROM mysql.user WHERE user = 'crm_user';
EXIT;
```

### Step 5: Firewall for MySQL
Allow incoming MySQL connections on port 3306.
> [!IMPORTANT]
> If possible, restrict port 3306 to specific IPs (e.g. Render outbound IPs or NAT gateway) instead of opening it to the public internet:

```bash
# If restricting to a specific IP:
sudo ufw allow from <ALLOWED_IP> to any port 3306 proto tcp

# Or if public access is required:
sudo ufw allow 3306/tcp
sudo ufw reload
```

### Step 6: Connect from Render
In your **Render Dashboard** (for your `crm-backend`, `crm-worker`, `crm-scheduler`, and `crm-gateway` services):

Set the following environment variables:
- `DB_HOST` / `MYSQL_HOST`: `<VM_PUBLIC_IP>`
- `DB_PORT` / `MYSQL_PORT`: `3306`
- `DB_DATABASE` / `MYSQL_DATABASE`: `crm_whatsapp`
- `DB_USERNAME` / `MYSQL_USER`: `crm_user`
- `DB_PASSWORD` / `MYSQL_PASSWORD`: `StrongSecurePassword123!`

---

## 4. Maintenance & Routine Operations

### Checking Service Logs (Docker Compose)
```bash
# View all logs in real time
docker compose -f docker-compose.yml -f docker-compose.production.yml logs -f

# View backend and gateway logs specifically:
docker compose -f docker-compose.yml -f docker-compose.production.yml logs -f backend whatsapp-gateway
```

### Updating Code & Redeploying (Docker Compose)
```bash
cd /home/deployer/crm-whatsapp
git pull origin main
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.production.yml exec -T backend php artisan migrate --force
```

### Automated Database Backups
Use the built-in backup script in `infrastructure/scripts/mysql-backup.sh`:

```bash
chmod +x infrastructure/scripts/mysql-backup.sh
# Test manual backup:
./infrastructure/scripts/mysql-backup.sh
```

To schedule daily backups at 02:00 AM via cron:
```bash
crontab -e
```
Add:
```cron
0 2 * * * /home/deployer/crm-whatsapp/infrastructure/scripts/mysql-backup.sh >> /var/log/mysql-backup.log 2>&1
```

