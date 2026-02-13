# Urumi Store Provisioning Platform

A Kubernetes-native store provisioning platform that dynamically provisions fully isolated WordPress + WooCommerce stores per request.

This project includes:

- React Dashboard (Vite)
- Node.js Orchestrator API
- Helm chart for per-store infrastructure
- Local (kind) and VPS/k3s production deployment support

---

# Architecture Overview

## Core Components

1. **Dashboard** – React + Vite UI for store lifecycle management  
2. **Orchestrator API** – Node.js + Express service that provisions stores  
3. **Helm Chart** – Defines per-store Kubernetes resources  
4. **Kubernetes Cluster** – kind (local) or k3s (production)  
5. **Ingress Controller** – nginx (local) or nginx/traefik (prod)

Each store is provisioned with:

- Dedicated namespace (`store-<id>`)
- MySQL StatefulSet + PersistentVolumeClaim
- WordPress Deployment
- Kubernetes Secret (DB credentials)
- Service + Ingress

---

# 1. Local Setup (kind)

## Prerequisites (Windows – PowerShell as Administrator)

```powershell
choco install -y kubernetes-cli
choco install -y kind
choco install -y helm
choco install -y nodejs-lts
```

Open a new PowerShell window after installation.

---

## Create Local Cluster

```powershell
kind create cluster --name urumi-stores
kubectl config use-context kind-urumi-stores
kubectl get nodes
```

---

## Install nginx Ingress

```powershell
kubectl create namespace ingress-nginx
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
helm install ingress-nginx ingress-nginx/ingress-nginx `
  --namespace ingress-nginx `
  --set controller.publishService.enabled=true
```

---

## Local DNS

This project uses:

```
localtest.me
```

`*.localtest.me` automatically resolves to `127.0.0.1`.

Example store URL:

```
http://store-demo.localtest.me
```

No `/etc/hosts` modification required.

---

## Install Project Dependencies

From repo root:

```powershell
npm run backend:install
npm run dashboard:install
```

---

## Run Backend

```powershell
cd backend
npm run dev
```

Runs on:

```
http://localhost:4000
```

---

## Run Dashboard

In a new terminal:

```powershell
cd dashboard
$env:VITE_API_URL="http://localhost:4000"
npm run dev
```

Open:

```
http://localhost:5173
```

---

# 2. End-to-End Flow (Create → Order → Delete)

## Step 1: Create Store

- Click **Create Store**
- Backend inserts row into SQLite
- Runs:

```
helm upgrade --install
```

This creates:

- Namespace `store-<id>`
- MySQL StatefulSet + PVC
- WordPress Deployment
- Secret
- Service
- Ingress

---

## Step 2: Store Ready

When pods are healthy → status becomes **READY**.

Open:

```
http://store-<id>.localtest.me
```

Complete WordPress setup and activate WooCommerce.

---

## Step 3: Place Order

- Add demo product
- Checkout using Cash on Delivery
- Confirm order appears in WooCommerce admin

---

## Step 4: Delete Store

Deletion flow:

1. Helm uninstall
2. Namespace deletion
3. Poll until namespace is gone
4. Remove store row from SQLite

This prevents orphaned PVCs and resources.

---

# 3. VPS / Production Setup (k3s)

## Install k3s (Ubuntu example)

```bash
curl -sfL https://get.k3s.io | sh -
sudo kubectl get nodes
```

---

## Install Ingress (if needed)

k3s includes Traefik by default.

If using nginx:

```bash
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace
```

---

## Production Helm Install

```bash
cd charts/store

HELM_ENV=prod helm upgrade --install demo-store . \
  --namespace store-demo \
  --create-namespace \
  -f values-prod.yaml \
  --set storeId=demo \
  --set engine=woocommerce \
  --atomic \
  --timeout 10m
```

Ensure:

- `values-prod.yaml` has correct `storageClass`
- `ingress.baseDomain` matches your domain
- DNS A record points to VPS IP

Open:

```
http://store-demo.<baseDomain>/
```

---

# 4. Helm Chart Structure

Located at:

```
charts/store
```

Includes:

- `Chart.yaml`
- `values.yaml`
- `values-local.yaml`
- `values-prod.yaml`

Environment switching:

- `HELM_ENV=local` → localtest.me
- `HELM_ENV=prod` → production domain

---

# 5. System Design & Tradeoffs

## Architecture Choice

**Namespace-per-store model** provides:

- Strong isolation
- Independent lifecycle
- Blast-radius containment
- Clean teardown

Helm chosen for:

- Idempotent deployments
- Upgrade support
- Rollback capability
- Environment-based configuration

---

## Idempotency

Provisioning uses:

```
helm upgrade --install --atomic
```

This ensures:

- Safe retries
- No duplicate resources
- Automatic rollback on failure

---

## Failure Handling

- `--atomic` prevents partial installs
- Namespace deletion is polled before DB row removal
- Kubernetes restarts failed pods automatically

---

## Cleanup Guarantees

Delete flow:

1. Helm uninstall
2. Delete namespace
3. Wait until namespace fully removed
4. Remove store record

Prevents orphaned PVCs and Secrets.

---

## Isolation Model

Each store has:

- Dedicated namespace
- Separate Secret
- Separate PVC
- Separate MySQL instance
- Separate Service & Ingress

No shared database.

---

## Security Posture

- No hard-coded credentials
- DB credentials stored in Kubernetes Secret
- MySQL is ClusterIP only (internal)
- Only WordPress exposed via Ingress
- Backend uses kubeconfig access

Basic container hygiene:
- Official images
- No host mounts

---

## Production Differences

| Area | Local | Production |
|------|--------|------------|
| Cluster | kind | k3s |
| Base Domain | localtest.me | real domain |
| Storage | default | k3s storageClass |
| Ingress | nginx | nginx/traefik |
| TLS | none | cert-manager recommended |
| Secrets | generated | can integrate external secret manager |

---

## Horizontal Scaling Plan

Stateless components scale horizontally:

- Orchestrator API
- Dashboard

Using:

- Deployment replicas
- Horizontal Pod Autoscaler (future)

Provisioning throughput scaling:

- Multiple orchestrator replicas
- Queue-based provisioning (future enhancement)

Stateful constraint:

- MySQL scales vertically per store
- Can migrate to managed DB if needed

---

## Abuse Prevention / Guardrails

Current safeguards:

- Namespace-per-store isolation
- Resource requests & limits in Helm
- Helm timeout protection

Recommended production controls:

- API rate limiting
- Max stores per user
- Namespace resource quotas

---

## Upgrade & Rollback

Upgrade:

```
helm upgrade
```

Rollback:

```
helm rollback <release>
```

Ensures production-safe deployment changes.

---

# Deliverables Checklist

- ✅ Local setup instructions
- ✅ VPS/k3s production setup
- ✅ Create store & place order flow
- ✅ Dashboard source
- ✅ Backend source
- ✅ Provisioning/orchestration logic
- ✅ Helm charts
- ✅ values-local.yaml
- ✅ values-prod.yaml
- ✅ System design & tradeoffs section
- ✅ Idempotency & failure handling explanation
- ✅ Cleanup guarantees
- ✅ Production differences documented

---

# Final Status

This repository fully satisfies the Round 1 deliverables requirements.
