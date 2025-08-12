-- Simpler fix for the foreign key constraint issue
-- This only updates the action_logs table constraint

BEGIN;

-- Drop the existing constraint
ALTER TABLE action_logs 
DROP CONSTRAINT IF EXISTS action_logs_user_id_fkey;

-- Recreate with CASCADE delete behavior
ALTER TABLE action_logs 
ADD CONSTRAINT action_logs_user_id_fkey 
FOREIGN KEY (user_id) 
REFERENCES auth.users(id) 
ON DELETE CASCADE;

COMMIT;

-- Verify the constraint was updated
SELECT 
    conname AS constraint_name,
    confdeltype AS delete_action
FROM pg_constraint
WHERE conrelid = 'action_logs'::regclass
    AND contype = 'f';