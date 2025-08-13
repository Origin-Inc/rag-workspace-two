-- Create test user (password: testpassword123)
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES (
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'test@example.com',
  crypt('testpassword123', gen_salt('bf')),
  NOW(),
  NOW(),
  NOW()
);

-- Create a test project
INSERT INTO projects (id, name, description, owner_id, created_at, updated_at)
VALUES (
  'a47ac10b-58cc-4372-a567-0e02b2c3d480',
  'Test Project',
  'A test project for the page editor',
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  NOW(),
  NOW()
);

-- Add user as project collaborator
INSERT INTO project_collaborators (project_id, user_id, role, created_at)
VALUES (
  'a47ac10b-58cc-4372-a567-0e02b2c3d480',
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'owner',
  NOW()
);

-- Create a test page
INSERT INTO pages (id, project_id, title, content, canvas_settings, created_by, created_at, updated_at)
VALUES (
  'b47ac10b-58cc-4372-a567-0e02b2c3d481',
  'a47ac10b-58cc-4372-a567-0e02b2c3d480',
  'Test Page',
  '{}'::jsonb,
  '{"grid": {"columns": 12, "rowHeight": 40, "gap": 8}}'::jsonb,
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  NOW(),
  NOW()
);

-- Create some test blocks
INSERT INTO page_blocks (page_id, type, content, position, created_at, updated_at)
VALUES 
  ('b47ac10b-58cc-4372-a567-0e02b2c3d481', 'heading', '{"text": "Welcome to the Page Editor"}'::jsonb, '{"x": 0, "y": 0, "width": 12, "height": 1}'::jsonb, NOW(), NOW()),
  ('b47ac10b-58cc-4372-a567-0e02b2c3d481', 'text', '{"text": "This is a test paragraph block with some sample content."}'::jsonb, '{"x": 0, "y": 1, "width": 12, "height": 1}'::jsonb, NOW(), NOW()),
  ('b47ac10b-58cc-4372-a567-0e02b2c3d481', 'bullet_list', '{"items": [{"id": "1", "text": "First item"}, {"id": "2", "text": "Second item"}]}'::jsonb, '{"x": 0, "y": 2, "width": 6, "height": 2}'::jsonb, NOW(), NOW());