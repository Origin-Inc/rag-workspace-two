# RAG Application

A production-ready Retrieval-Augmented Generation (RAG) application built with Remix, PostgreSQL with pgvector, and Redis.

## Features

- ✅ Modern React with Remix framework
- ✅ TypeScript with strict mode
- ✅ PostgreSQL with pgvector for vector similarity search
- ✅ Redis for caching and queue management
- ✅ Prisma ORM for type-safe database access
- ✅ JWT authentication
- ✅ Comprehensive testing with Vitest
- ✅ Tailwind CSS for styling
- ✅ ESLint and Prettier for code quality
- ✅ Health check endpoints
- ✅ Docker support

## Prerequisites

- Node.js 18+ and npm
- Docker and Docker Compose (for database services)
- PostgreSQL 15+ (if running locally without Docker)
- Redis 7+ (if running locally without Docker)

## Quick Start

### 1. Clone and Install

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
```

### 2. Database Setup

#### Option A: Using Docker (Recommended)

```bash
# Start PostgreSQL and Redis
docker-compose up -d

# Wait for services to be ready
sleep 10

# Push database schema
npx prisma db push
```

#### Option B: Using Local Services

Ensure PostgreSQL and Redis are running locally, then update the `.env` file with your connection strings:

```env
DATABASE_URL=postgresql://your_user:your_password@localhost:5432/your_db
REDIS_URL=redis://localhost:6379
```

Then push the schema:

```bash
npx prisma db push
```

### 3. Start Development Server

```bash
npm run dev
```

The application will be available at http://localhost:3000

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm test` - Run tests
- `npm run test:ui` - Run tests with UI
- `npm run test:coverage` - Run tests with coverage
- `npm run typecheck` - Run TypeScript type checking
- `npm run lint` - Run ESLint
- `npx prisma studio` - Open Prisma Studio for database management

## Project Structure

```
rag-app/
├── app/
│   ├── components/     # React components
│   ├── routes/         # Remix routes
│   ├── services/       # Business logic services
│   ├── models/         # Data models
│   ├── utils/          # Utility functions
│   ├── workers/        # Background workers
│   ├── hooks/          # React hooks
│   ├── types/          # TypeScript types
│   └── test/           # Test setup
├── prisma/
│   └── schema.prisma   # Database schema
├── public/             # Static assets
├── scripts/            # Utility scripts
├── docker-compose.yml  # Docker services configuration
├── vite.config.ts      # Vite configuration
├── vitest.config.ts    # Vitest configuration
├── tsconfig.json       # TypeScript configuration
└── README.md          # This file
```

## API Endpoints

### Health Check
- `GET /health` - Returns system health status

## Environment Variables

See `.env.example` for all available configuration options. Key variables include:

- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `OPENAI_API_KEY` - OpenAI API key for embeddings
- `JWT_SECRET` - Secret for JWT tokens
- `SESSION_SECRET` - Secret for session management

## Testing

The project includes comprehensive tests:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test -- --watch

# Run tests with coverage
npm run test:coverage

# Run tests with UI
npm run test:ui
```

## Production Deployment

1. Build the application:
```bash
npm run build
```

2. Set production environment variables

3. Start the server:
```bash
npm run start
```

## Docker Deployment

Build and run with Docker:

```bash
# Build image
docker build -t rag-app .

# Run container
docker run -p 3000:3000 --env-file .env rag-app
```

## Troubleshooting

### Database Connection Issues

If you encounter database connection issues:

1. Ensure PostgreSQL is running and accessible
2. Check your `DATABASE_URL` in `.env`
3. Verify pgvector extension is installed:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

### Redis Connection Issues

1. Ensure Redis is running
2. Check your `REDIS_URL` in `.env`
3. Test connection: `redis-cli ping`

### TypeScript Errors

Run `npm run typecheck` to identify and fix type errors.

## License

MIT