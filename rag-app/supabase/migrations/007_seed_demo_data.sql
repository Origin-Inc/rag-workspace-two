-- Seed demo data for development and testing

-- Insert demo workspace
INSERT INTO workspaces_extended (id, workspace_id)
VALUES (
  '550e8400-e29b-41d4-a716-446655440000'::uuid,
  'demo-workspace'
)
ON CONFLICT (id) DO NOTHING;

-- Insert demo user workspace membership
-- This will only insert if the user exists (from auth)
INSERT INTO user_workspaces (user_id, workspace_id, role)
SELECT 
  '660d0519-bb28-49bc-98fc-aa2af5e6fb6c'::uuid,
  '550e8400-e29b-41d4-a716-446655440000'::uuid,
  'owner'
WHERE EXISTS (
  SELECT 1 FROM auth.users 
  WHERE id = '660d0519-bb28-49bc-98fc-aa2af5e6fb6c'::uuid
)
ON CONFLICT (user_id, workspace_id) DO NOTHING;