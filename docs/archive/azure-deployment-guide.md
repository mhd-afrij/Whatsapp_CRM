# Azure Hosting & Deployment Guide

This guide details how to deploy and host the complete **CRM-WhatsApp** stack on **Microsoft Azure**.

The codebase is already integrated with **Azure Blob Storage** for media uploads, chat attachments, and report exports. Depending on your budget and architecture needs, choose between:

- **[Option 1: Azure Virtual Machine with Docker Compose (Recommended)](#option-1-azure-virtual-machine-with-docker-compose-recommended)** — Fastest, simplest, and most cost-effective. Runs the unified Docker Compose production stack on a single managed Linux VM.
- **[Option 2: Azure Managed PaaS Architecture](#option-2-azure-managed-paas-architecture-enterprise)** — Enterprise architecture using Azure Container Apps (ACA), Azure Database for MySQL Flexible Server, and Azure Cache for Redis.

---

## Prerequisites: Azure Setup

1. **Azure CLI (`az`)**: Already installed on your system.
2. **Log into Azure**:
   ```powershell
   az login
   ```
3. **Set your active subscription** (if multiple):
   ```powershell
   az account set --subscription "<YOUR_SUBSCRIPTION_NAME_OR_ID>"
   ```

---

## 1. Create Shared Azure Resources

Regardless of hosting option, set up the **Resource Group** and **Azure Blob Storage Account** (which the CRM uses for media/attachments):

```bash
# 1. Variables
RESOURCE_GROUP="rg-crm-whatsapp"
LOCATION="eastus" # or westeurope, southeastasia, etc.
STORAGE_ACCOUNT="crmstorage$(openssl rand -hex 4)" # must be globally unique lowercase
CONTAINER_NAME="whatsapp-media"

# 2. Create Resource Group
az group create --name $RESOURCE_GROUP --location $LOCATION

# 3. Create Storage Account (Standard LRS)
az storage account create \
  --name $STORAGE_ACCOUNT \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --sku Standard_LRS \
  --kind StorageV2 \
  --allow-blob-public-access false

# 4. Get Storage Account Key & Connection String
STORAGE_KEY=$(az storage account keys list --resource-group $RESOURCE_GROUP --account-name $STORAGE_ACCOUNT --query "[0].value" -o tsv)
STORAGE_CONNECTION_STRING=$(az storage account show-connection-string --resource-group $RESOURCE_GROUP --account-name $STORAGE_ACCOUNT --query connectionString -o tsv)

# 5. Create the private container
az storage container create \
  --name $CONTAINER_NAME \
  --account-name $STORAGE_ACCOUNT \
  --account-key $STORAGE_KEY
```

> **Save these values for your `.env`:**
> - `AZURE_STORAGE_ACCOUNT_NAME`: value of `$STORAGE_ACCOUNT`
> - `AZURE_STORAGE_ACCOUNT_KEY`: value of `$STORAGE_KEY`
> - `AZURE_STORAGE_CONNECTION_STRING`: value of `$STORAGE_CONNECTION_STRING`
> - `AZURE_STORAGE_CONTAINER_NAME`: `whatsapp-media`
> - `AZURE_STORAGE_URL`: `https://<STORAGE_ACCOUNT>.blob.core.windows.net`

---

## Option 1: Azure Virtual Machine with Docker Compose (Recommended)

This option deploys the tested `docker-compose.production.yml` stack to a standard Ubuntu Azure VM.

### Step 1: Provision the Azure VM

```bash
# VM Specifications: Ubuntu 24.04 LTS, Standard_B2s (2 vCPU, 4GB RAM) or Standard_D2s_v5 (8GB RAM)
VM_NAME="vm-crm-whatsapp"

az vm create \
  --resource-group $RESOURCE_GROUP \
  --name $VM_NAME \
  --image Ubuntu2404 \
  --size Standard_B2s \
  --admin-username deployer \
  --generate-ssh-keys \
  --public-ip-sku Standard
```

### Step 2: Open Inbound Ports in Network Security Group (NSG)

Open HTTP (80) and HTTPS (443):

```bash
az vm open-port --resource-group $RESOURCE_GROUP --name $VM_NAME --port 80 --priority 1001
az vm open-port --resource-group $RESOURCE_GROUP --name $VM_NAME --port 443 --priority 1002
```

### Step 3: Get Public IP and Connect via SSH

```bash
VM_IP=$(az vm show -d -g $RESOURCE_GROUP -n $VM_NAME --query publicIps -o tsv)
echo "VM Public IP: $VM_IP"

# Connect to the Azure VM:
ssh deployer@$VM_IP
```

### Step 4: Install Docker on the Azure VM

Once logged into the VM:

```bash
# 1. Update packages
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git ufw

# 2. Install official Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker deployer
newgrp docker

# 3. Configure UFW Firewall
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### Step 5: Clone & Configure CRM-WhatsApp

```bash
git clone <YOUR_GIT_REPO_URL> crm-whatsapp
cd crm-whatsapp

cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
cp whatsapp-gateway/.env.example whatsapp-gateway/.env
```

Configure `.env` with:
- Domain URL: `https://crm.yourdomain.com` (or `http://<VM_IP>` for initial testing)
- Strong passwords for `DB_PASSWORD` and `MYSQL_ROOT_PASSWORD`
- Generated tokens for `INTERNAL_GATEWAY_TOKEN`, `INTERNAL_SHARED_SECRET`, and `CREDENTIALS_ENCRYPTION_KEY`
- The Azure Storage credentials obtained in Section 1:
  ```env
  STORAGE_PROVIDER=azure
  FILESYSTEM_DISK=azure
  AZURE_STORAGE_ACCOUNT_NAME=<STORAGE_ACCOUNT>
  AZURE_STORAGE_ACCOUNT_KEY=<STORAGE_KEY>
  AZURE_STORAGE_CONTAINER_NAME=whatsapp-media
  AZURE_STORAGE_URL=https://<STORAGE_ACCOUNT>.blob.core.windows.net
  ```

### Step 6: Start Stack & Run Migrations

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.production.yml exec -T backend php artisan migrate --force
```

### Step 7: Domain & SSL Setup

Point your custom domain DNS A-record to `$VM_IP`. Then install Certbot for free Let's Encrypt certificates:

```bash
sudo apt install -y certbot
sudo certbot certonly --standalone -d crm.yourdomain.com
sudo mkdir -p infrastructure/nginx/certs
sudo cp /etc/letsencrypt/live/crm.yourdomain.com/fullchain.pem infrastructure/nginx/certs/cert.pem
sudo cp /etc/letsencrypt/live/crm.yourdomain.com/privkey.pem infrastructure/nginx/certs/key.pem
docker compose -f docker-compose.yml -f docker-compose.production.yml restart nginx
```

---

## Option 2: Azure Managed PaaS Architecture (Enterprise)

If you prefer serverless/managed infrastructure with zero VM management:

```
                  +-----------------------------------+
                  |      Azure Front Door / TLS       |
                  +-----------------+-----------------+
                                    |
            +-----------------------+-----------------------+
            |                                               |
+-----------v-----------+                       +-----------v-----------+
| Azure Container App   |                       | Azure Container App   |
| (Frontend: Next.js)   |                       | (Backend: Laravel)    |
+-----------+-----------+                       +-----------+-----------+
            |                                               |
            |                                   +-----------v-----------+
            |                                   | Azure Container App   |
            |                                   | (Gateway: Node/Baileys|
            |                                   +-----------+-----------+
            |                                               |
+-----------v-----------------------------------------------v-----------+
| Managed Services:                                                     |
| - Azure Database for MySQL Flexible Server (Port 3306)                |
| - Azure Cache for Redis (Port 6379/6380)                              |
| - Azure Blob Storage (whatsapp-media)                                 |
| - Azure Files (SMB mount for /app/sessions Baileys credentials)       |
+-----------------------------------------------------------------------+
```

### Managed Services Breakdown:

1. **Database: Azure Database for MySQL (Flexible Server)**
   ```bash
   az mysql flexible-server create \
     --name "crm-mysql-$(openssl rand -hex 3)" \
     --resource-group $RESOURCE_GROUP \
     --location $LOCATION \
     --admin-user crmadmin \
     --admin-password "StrongPassword123!" \
     --sku-name Standard_B1ms \
     --tier Burstable \
     --storage-size 32
   ```

2. **Cache & Queue: Azure Cache for Redis**
   ```bash
   az redis create \
     --name "crm-redis-$(openssl rand -hex 3)" \
     --resource-group $RESOURCE_GROUP \
     --location $LOCATION \
     --sku Basic \
     --vm-size c0
   ```

3. **WhatsApp Session Storage: Azure File Share**
   > [!IMPORTANT]
   > The WhatsApp Baileys gateway requires persistent disk storage at `/app/sessions`. In Azure Container Apps, attach an **Azure File Share** as an Azure storage volume mount to `/app/sessions`.

4. **Container Registry (ACR)**:
   Build and push images using Azure Container Registry:
   ```bash
   ACR_NAME="crmregistry$(openssl rand -hex 3)"
   az acr create --resource-group $RESOURCE_GROUP --name $ACR_NAME --sku Basic --admin-enabled true

   # Build images directly in the cloud:
   az acr build --registry $ACR_NAME --image crm-backend:latest ./backend
   az acr build --registry $ACR_NAME --image crm-gateway:latest ./whatsapp-gateway
   az acr build --registry $ACR_NAME --image crm-frontend:latest ./frontend
   ```

5. **Deploy Apps with Azure Container Apps (ACA)**:
   Deploy each service pointing to the managed MySQL, Redis, and Blob Storage.

---

## Cost Comparison

| Deployment Model | Estimated Cost (Monthly) | Complexity | Maintenance |
| :--- | :--- | :--- | :--- |
| **Option 1: Azure VM (B2s / D2s_v5)** | **\$30 – \$65 / month** | Low (Single VM) | Standard Linux updates & Docker backups |
| **Option 2: Azure PaaS (ACA + Managed MySQL + Redis)** | **\$90 – \$180 / month** | Medium-High | Zero OS patching, automated cloud failover |

---

## Routine Operations on Azure

### Stop/Deallocate VM to save costs when not in use:
```powershell
az vm deallocate --resource-group rg-crm-whatsapp --name vm-crm-whatsapp
```

### Start VM again:
```powershell
az vm start --resource-group rg-crm-whatsapp --name vm-crm-whatsapp
```

### View VM Metrics:
```powershell
az vm show -d -g rg-crm-whatsapp -n vm-crm-whatsapp --query "{IP:publicIps, Status:powerState}" -o table
```

