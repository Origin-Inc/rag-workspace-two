-- Generic increment function for numeric columns
CREATE OR REPLACE FUNCTION increment(
  table_name text,
  column_name text,
  row_id text,
  increment_value integer DEFAULT 1
)
RETURNS void AS $$
BEGIN
  EXECUTE format('
    UPDATE %I 
    SET %I = %I + $1, updated_at = NOW()
    WHERE workspace_id = $2',
    table_name, column_name, column_name
  ) USING increment_value, row_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create a page from a template
CREATE OR REPLACE FUNCTION create_page_from_template(
  template_id UUID,
  target_workspace_id TEXT,
  target_parent_id UUID DEFAULT NULL,
  created_by_user TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  new_page_id UUID;
  template_content JSONB;
  page_data JSONB;
  block_data JSONB;
  block_record RECORD;
BEGIN
  -- Get template content
  SELECT content INTO template_content
  FROM templates
  WHERE id = template_id;
  
  IF template_content IS NULL THEN
    RAISE EXCEPTION 'Template not found';
  END IF;
  
  -- Extract page data
  page_data := template_content->'page';
  
  -- Create new page
  INSERT INTO pages (
    workspace_id,
    parent_id,
    title,
    icon,
    type,
    content,
    properties,
    created_by
  ) VALUES (
    target_workspace_id,
    target_parent_id,
    COALESCE(page_data->>'title', 'Untitled'),
    page_data->>'icon',
    COALESCE((page_data->>'type')::page_type, 'document'),
    COALESCE(page_data->'content', '{}'::jsonb),
    COALESCE(page_data->'properties', '{}'::jsonb),
    created_by_user
  ) RETURNING id INTO new_page_id;
  
  -- Create blocks if they exist
  IF template_content->'blocks' IS NOT NULL THEN
    FOR block_record IN 
      SELECT * FROM jsonb_array_elements(template_content->'blocks') AS block
    LOOP
      block_data := block_record.block;
      
      INSERT INTO blocks (
        page_id,
        type,
        content,
        properties,
        position,
        metadata,
        created_by
      ) VALUES (
        new_page_id,
        (block_data->>'type')::block_type,
        COALESCE(block_data->'content', '{}'::jsonb),
        COALESCE(block_data->'properties', '{}'::jsonb),
        COALESCE(block_data->'position', '{"x": 0, "y": 0, "width": 12, "height": 1}'::jsonb),
        COALESCE(block_data->'metadata', '{}'::jsonb),
        created_by_user
      );
    END LOOP;
  END IF;
  
  -- Increment template use count
  UPDATE templates
  SET use_count = use_count + 1
  WHERE id = template_id;
  
  RETURN new_page_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to duplicate a page with all its blocks
CREATE OR REPLACE FUNCTION duplicate_page(
  source_page_id UUID,
  new_title TEXT DEFAULT NULL,
  new_parent_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  new_page_id UUID;
  source_page RECORD;
BEGIN
  -- Get source page
  SELECT * INTO source_page
  FROM pages
  WHERE id = source_page_id;
  
  IF source_page IS NULL THEN
    RAISE EXCEPTION 'Source page not found';
  END IF;
  
  -- Create new page
  INSERT INTO pages (
    workspace_id,
    parent_id,
    title,
    icon,
    cover_image,
    type,
    content,
    properties,
    created_by
  ) VALUES (
    source_page.workspace_id,
    COALESCE(new_parent_id, source_page.parent_id),
    COALESCE(new_title, source_page.title || ' (Copy)'),
    source_page.icon,
    source_page.cover_image,
    source_page.type,
    source_page.content,
    source_page.properties,
    source_page.created_by
  ) RETURNING id INTO new_page_id;
  
  -- Copy all blocks
  INSERT INTO blocks (
    page_id,
    parent_id,
    type,
    content,
    properties,
    position,
    metadata,
    created_by
  )
  SELECT
    new_page_id,
    parent_id,
    type,
    content,
    properties,
    position,
    metadata,
    created_by
  FROM blocks
  WHERE page_id = source_page_id;
  
  RETURN new_page_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to move a page to a different parent or workspace
CREATE OR REPLACE FUNCTION move_page(
  page_id UUID,
  new_parent_id UUID DEFAULT NULL,
  new_workspace_id TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  current_page RECORD;
BEGIN
  -- Get current page
  SELECT * INTO current_page
  FROM pages
  WHERE id = page_id;
  
  IF current_page IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Check for circular reference if changing parent
  IF new_parent_id IS NOT NULL THEN
    IF EXISTS (
      WITH RECURSIVE parent_chain AS (
        SELECT id, parent_id
        FROM pages
        WHERE id = new_parent_id
        
        UNION ALL
        
        SELECT p.id, p.parent_id
        FROM pages p
        INNER JOIN parent_chain pc ON p.id = pc.parent_id
      )
      SELECT 1 FROM parent_chain WHERE id = page_id
    ) THEN
      RAISE EXCEPTION 'Cannot move page: would create circular reference';
    END IF;
  END IF;
  
  -- Update page
  UPDATE pages
  SET 
    parent_id = COALESCE(new_parent_id, parent_id),
    workspace_id = COALESCE(new_workspace_id, workspace_id),
    updated_at = NOW()
  WHERE id = page_id;
  
  -- If workspace changed, update all child pages
  IF new_workspace_id IS NOT NULL AND new_workspace_id != current_page.workspace_id THEN
    WITH RECURSIVE child_pages AS (
      SELECT id
      FROM pages
      WHERE parent_id = page_id
      
      UNION ALL
      
      SELECT p.id
      FROM pages p
      INNER JOIN child_pages cp ON p.parent_id = cp.id
    )
    UPDATE pages
    SET workspace_id = new_workspace_id
    WHERE id IN (SELECT id FROM child_pages);
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get workspace statistics
CREATE OR REPLACE FUNCTION get_workspace_stats(workspace_id_param TEXT)
RETURNS TABLE (
  total_pages BIGINT,
  total_blocks BIGINT,
  total_comments BIGINT,
  active_users BIGINT,
  storage_used BIGINT,
  last_activity TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM pages WHERE workspace_id = workspace_id_param AND NOT is_deleted),
    (SELECT COUNT(*) FROM blocks b JOIN pages p ON b.page_id = p.id WHERE p.workspace_id = workspace_id_param),
    (SELECT COUNT(*) FROM block_comments bc JOIN pages p ON bc.page_id = p.id WHERE p.workspace_id = workspace_id_param),
    (SELECT COUNT(DISTINCT user_id) FROM page_activity pa JOIN pages p ON pa.page_id = p.id WHERE p.workspace_id = workspace_id_param AND pa.created_at > NOW() - INTERVAL '30 days'),
    (SELECT COALESCE(storage_used_bytes, 0) FROM workspaces_extended WHERE workspace_id = workspace_id_param),
    (SELECT MAX(pa.created_at) FROM page_activity pa JOIN pages p ON pa.page_id = p.id WHERE p.workspace_id = workspace_id_param);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;