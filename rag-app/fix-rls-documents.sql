-- Add a policy that allows the service role to access all documents
-- This is needed for server-side RAG operations

-- Create a policy for service role access (bypasses user checks)
CREATE POLICY "Service role can access all documents"
  ON documents
  FOR ALL
  USING (auth.role() = 'service_role');

-- Alternative: Create a more permissive policy for authenticated users
-- This allows any authenticated user to read documents in the workspace
CREATE POLICY "Authenticated users can read workspace documents"
  ON documents
  FOR SELECT
  USING (
    auth.role() = 'authenticated' 
    AND workspace_id = '550e8400-e29b-41d4-a716-446655440000'
  );

-- For debugging: Temporarily allow all reads (REMOVE IN PRODUCTION!)
-- CREATE POLICY "Temporary allow all reads"
--   ON documents
--   FOR SELECT
--   USING (true);