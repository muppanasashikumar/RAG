# Production Deployment Guide

This guide sets up automated CI/CD with GitHub Actions and deploys to a Linux VPS using Docker Compose.

## Fastest Free Deploy (recommended for sharing)

If your goal is to quickly share a public URL with a recruiter, use:

- Frontend: **Vercel Free**
- Backend: **Render Free**

### 1) Deploy backend on Render (free)

1. Push your code to GitHub.
2. Go to [Render Dashboard](https://dashboard.render.com/).
3. Create service using **Blueprint** and select this repository.
4. Render will auto-detect `render.yaml` and create `rag-backend`.
5. In Render, fill required secret env vars:
   - `OPENAI_API_KEY`
   - `MONGO_URI`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
6. Wait for deploy and copy backend URL, for example:
   - `https://rag-backend-xxxx.onrender.com`

### 2) Deploy frontend on Vercel (free)

1. Go to [Vercel](https://vercel.com/) and import this GitHub repo.
2. Set **Root Directory** to `frontend`.
3. Add environment variable:
   - `NEXT_PUBLIC_BACKEND_API_URL=https://rag-backend-xxxx.onrender.com`
4. Deploy and copy frontend URL:
   - `https://your-app.vercel.app`

That Vercel URL is what you share with recruiters.

### 3) Important notes for free tiers

- Render free services may sleep after inactivity; first request can be slow.
- Vercel stays fast; only backend wake-up may add delay.
- This setup is best for demo/interview sharing and zero-cost hosting.

## What was added

- `./.github/workflows/ci.yml`:
  - Frontend: install, lint, test, build
  - Backend: dependency install + import/compile checks
- `./.github/workflows/cd.yml`:
  - Builds Docker images for frontend and backend
  - Pushes images to GitHub Container Registry (GHCR)
  - Deploys to your server over SSH
- `./docker-compose.prod.yml`:
  - Production compose file using image tags from CI/CD
- `./.env.production.example`:
  - Required runtime environment variables

## 1) Server prerequisites

Use an Ubuntu server with Docker + Compose plugin installed.

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin
sudo systemctl enable docker
sudo systemctl start docker
sudo mkdir -p /opt/rag
```

Copy your runtime env file:

```bash
sudo cp /path/to/.env.production /opt/rag/.env.production
```

Use `./.env.production.example` as the source template.

## 2) GitHub repository secrets

Add these secrets in GitHub: `Settings -> Secrets and variables -> Actions`.

- `DEPLOY_HOST`: server IP or hostname
- `DEPLOY_USER`: SSH user on server
- `DEPLOY_SSH_KEY`: private SSH key for deployment user
- `GHCR_READ_TOKEN`: GitHub token with `read:packages` permission

Notes:
- The workflow uses `GITHUB_TOKEN` to push images to GHCR.
- `GHCR_READ_TOKEN` is used on the server to pull private images.

## 3) First deployment

Push to `main`. The pipeline will:

1. Run CI checks
2. Build and push both images to GHCR
3. Upload `docker-compose.prod.yml` to `/opt/rag`
4. Pull and start containers on the server

## 4) DNS and TLS (recommended)

Put a reverse proxy (Nginx/Caddy/Traefik) in front of:

- Frontend: `http://127.0.0.1:3000`
- Backend: `http://127.0.0.1:8000`

Expose:

- `https://yourdomain.com` -> frontend
- `https://api.yourdomain.com` -> backend

Then set:

- `NEXT_PUBLIC_BACKEND_API_URL=https://api.yourdomain.com`

in `/opt/rag/.env.production`.

## 5) Rollback

To rollback manually on the server:

```bash
cd /opt/rag
FRONTEND_IMAGE=ghcr.io/<owner>/rag-frontend \
BACKEND_IMAGE=ghcr.io/<owner>/rag-backend \
IMAGE_TAG=<previous_commit_sha> \
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```
