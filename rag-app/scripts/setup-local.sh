#!/bin/bash

echo "🚀 Setting up local development environment..."

# Check if .env exists, if not copy from example
if [ ! -f .env ]; then
  echo "Creating .env file from .env.example..."
  cp .env.example .env
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Generate Prisma client
echo "🗄️ Generating Prisma client..."
npx prisma generate

echo "✅ Setup complete!"
echo ""
echo "To start the development server, run:"
echo "  npm run dev"
echo ""
echo "For database setup with Docker, run:"
echo "  docker-compose up -d"
echo "  npx prisma db push"
echo ""
echo "For testing, run:"
echo "  npm test"