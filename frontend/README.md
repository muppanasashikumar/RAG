This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

The Next.js frontend now lives in `frontend/`.

First, run the development server:

```bash
cd frontend
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `frontend/src/app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Run with Docker

Build and run the production image:

```bash
docker build -t rag-app ./frontend
docker run --rm -p 3000:3000 --env-file .env.local rag-app
```

Or use Docker Compose:

```bash
docker compose up --build
```

Then open [http://localhost:3000](http://localhost:3000).

This now starts:
- Next.js frontend at [http://localhost:3000](http://localhost:3000)
- FastAPI backend at [http://localhost:8000](http://localhost:8000)
- FastAPI docs at [http://localhost:8000/docs](http://localhost:8000/docs)

## Backend (FastAPI)

Python backend lives in `backend/`.

Quick start:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload
```

Lint and format:

```bash
cd backend
ruff check .
ruff format .
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
