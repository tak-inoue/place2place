# Place2Place

Place2Place is a web application for collecting short descriptions of urban areas and visualizing perceived similarities between places.

Users are shown an area name and asked to write a brief description of its atmosphere, character, or image. The application converts each response into an embedding, aggregates responses by area, and displays a two-dimensional map based on cosine similarity between area embeddings.

## Features

* Randomly prompts users with an area name
* Collects short text descriptions
* Generates embeddings using OpenAI's `text-embedding-3-small`
* Stores responses and aggregate area embeddings in PostgreSQL
* Computes similarities between areas using cosine similarity
* Visualizes the result as a two-dimensional map
* Updates the visualization periodically
* Does not display individual response texts in the UI or visualization API

## Tech Stack

* Next.js
* TypeScript
* PostgreSQL
* pgvector
* Drizzle ORM
* OpenAI API
* Vercel

## Environment Variables

Create a `.env.local` file in the project root.

```env
DATABASE_URL="postgresql://..."
OPENAI_API_KEY="sk-..."
```

Optional for local testing only:

```env
MOCK_EMBEDDINGS="true"
```

Do not enable `MOCK_EMBEDDINGS` in production.

## Local Development

Install dependencies:

```bash
npm install
```

Set up the database:

```bash
npm run db:enable-vector
npm run db:push
npm run db:seed
```

Start the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run db:enable-vector
npm run db:push
npm run db:seed
npm run db:rebuild-area-embeddings
```

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for production setup and deployment notes.
