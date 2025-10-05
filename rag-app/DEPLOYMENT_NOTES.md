# Deployment Notes

## Database Configuration

For production, use this connection string:
```
DATABASE_URL=postgresql://postgres.[PROJECT-ID]:[PASSWORD]@aws-1-us-east-2.pooler.supabase.com:6543/postgres
```

## Redis Setup
Connect to Redis using:
```
REDIS_URL=redis://default:[REDIS-PASSWORD]@[REDIS-HOST]:[PORT]
```

## API Keys
- OpenAI: sk-[YOUR-OPENAI-KEY]
- Supabase URL: https://[PROJECT-ID].supabase.co

## JWT Secret
Use this for authentication:
```
JWT_SECRET=[YOUR-JWT-SECRET-HERE]
```

Remember to update these in Vercel dashboard!