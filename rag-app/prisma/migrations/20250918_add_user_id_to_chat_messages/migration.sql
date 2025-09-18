-- Add user_id column to chat_messages table
ALTER TABLE "chat_messages" 
ADD COLUMN IF NOT EXISTS "user_id" UUID;

-- Add foreign key constraint
ALTER TABLE "chat_messages" 
ADD CONSTRAINT "chat_messages_user_id_fkey" 
FOREIGN KEY ("user_id") 
REFERENCES "users"("id") 
ON DELETE SET NULL 
ON UPDATE CASCADE;