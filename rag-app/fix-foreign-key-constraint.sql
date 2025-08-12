-- Fix foreign key constraint to be more permissive
-- This allows the action_logs table to handle missing users gracefully

BEGIN;

-- Drop the existing constraint
ALTER TABLE action_logs 
DROP CONSTRAINT IF EXISTS action_logs_user_id_fkey;

-- Recreate with CASCADE delete behavior
-- This means if a user is deleted from auth.users, their action logs are also deleted
ALTER TABLE action_logs 
ADD CONSTRAINT action_logs_user_id_fkey 
FOREIGN KEY (user_id) 
REFERENCES auth.users(id) 
ON DELETE CASCADE
ON UPDATE CASCADE;

-- Also update other tables that reference auth.users
ALTER TABLE action_previews 
DROP CONSTRAINT IF EXISTS action_previews_user_id_fkey;

ALTER TABLE action_previews 
ADD CONSTRAINT action_previews_user_id_fkey 
FOREIGN KEY (user_id) 
REFERENCES auth.users(id) 
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE undo_history 
DROP CONSTRAINT IF EXISTS undo_history_user_id_fkey;

ALTER TABLE undo_history 
ADD CONSTRAINT undo_history_user_id_fkey 
FOREIGN KEY (user_id) 
REFERENCES auth.users(id) 
ON DELETE CASCADE
ON UPDATE CASCADE;

COMMIT;

-- Verify the constraints were updated
SELECT 
    tc.table_name, 
    tc.constraint_name, 
    rc.update_rule,
    rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.referential_constraints rc 
    ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_name IN ('action_logs', 'action_previews', 'undo_history');