-- Task 19.11: Create error tracking tables for indexing pipeline

-- Table for tracking indexing errors
CREATE TABLE IF NOT EXISTS indexing_errors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  operation TEXT NOT NULL,
  error_message TEXT NOT NULL,
  error_stack TEXT,
  retry_count INTEGER DEFAULT 0,
  occurred_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMPTZ,
  resolution TEXT,
  
  -- Indexes for queries
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for error tracking
CREATE INDEX IF NOT EXISTS idx_indexing_errors_task_id ON indexing_errors(task_id);
CREATE INDEX IF NOT EXISTS idx_indexing_errors_entity ON indexing_errors(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_indexing_errors_occurred_at ON indexing_errors(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_indexing_errors_unresolved ON indexing_errors(resolved_at) WHERE resolved_at IS NULL;

-- Dead letter queue for failed indexing tasks
CREATE TABLE IF NOT EXISTS indexing_dlq (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  operation TEXT NOT NULL,
  error_message TEXT NOT NULL,
  error_stack TEXT,
  retry_count INTEGER DEFAULT 0,
  original_priority INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  added_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  reprocessed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reprocessing', 'resolved', 'failed')),
  
  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for DLQ
CREATE INDEX IF NOT EXISTS idx_indexing_dlq_status ON indexing_dlq(status);
CREATE INDEX IF NOT EXISTS idx_indexing_dlq_added_at ON indexing_dlq(added_at DESC);
CREATE INDEX IF NOT EXISTS idx_indexing_dlq_pending ON indexing_dlq(status) WHERE status = 'pending';

-- Circuit breaker state table
CREATE TABLE IF NOT EXISTS circuit_breaker_states (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  service_name TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL DEFAULT 'closed' CHECK (state IN ('closed', 'open', 'half-open')),
  failure_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  last_failure_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_state_change_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}',
  
  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create index for service lookups
CREATE INDEX IF NOT EXISTS idx_circuit_breaker_service ON circuit_breaker_states(service_name);

-- Error statistics aggregation table
CREATE TABLE IF NOT EXISTS indexing_error_stats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  hour_bucket TIMESTAMPTZ NOT NULL,
  entity_type TEXT,
  error_type TEXT,
  total_errors INTEGER DEFAULT 0,
  total_retries INTEGER DEFAULT 0,
  successful_retries INTEGER DEFAULT 0,
  dlq_additions INTEGER DEFAULT 0,
  avg_retry_count NUMERIC(10,2),
  max_retry_count INTEGER,
  
  -- Create composite unique constraint
  UNIQUE(hour_bucket, entity_type, error_type),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for statistics queries
CREATE INDEX IF NOT EXISTS idx_error_stats_bucket ON indexing_error_stats(hour_bucket DESC);
CREATE INDEX IF NOT EXISTS idx_error_stats_entity ON indexing_error_stats(entity_type);

-- Function to update circuit breaker state
CREATE OR REPLACE FUNCTION update_circuit_breaker(
  p_service_name TEXT,
  p_state TEXT,
  p_failure_count INTEGER DEFAULT NULL,
  p_success_count INTEGER DEFAULT NULL
) RETURNS void AS $$
BEGIN
  INSERT INTO circuit_breaker_states (
    service_name,
    state,
    failure_count,
    success_count,
    last_state_change_at
  ) VALUES (
    p_service_name,
    p_state,
    COALESCE(p_failure_count, 0),
    COALESCE(p_success_count, 0),
    CURRENT_TIMESTAMP
  )
  ON CONFLICT (service_name) DO UPDATE SET
    state = p_state,
    failure_count = COALESCE(p_failure_count, circuit_breaker_states.failure_count),
    success_count = COALESCE(p_success_count, circuit_breaker_states.success_count),
    last_state_change_at = CASE 
      WHEN circuit_breaker_states.state != p_state THEN CURRENT_TIMESTAMP
      ELSE circuit_breaker_states.last_state_change_at
    END,
    updated_at = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- Function to move task to DLQ
CREATE OR REPLACE FUNCTION move_to_dlq(
  p_task_id UUID,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_operation TEXT,
  p_error_message TEXT,
  p_error_stack TEXT DEFAULT NULL,
  p_retry_count INTEGER DEFAULT 0
) RETURNS UUID AS $$
DECLARE
  v_dlq_id UUID;
BEGIN
  -- Insert into DLQ
  INSERT INTO indexing_dlq (
    task_id,
    entity_type,
    entity_id,
    operation,
    error_message,
    error_stack,
    retry_count,
    added_at
  ) VALUES (
    p_task_id,
    p_entity_type,
    p_entity_id,
    p_operation,
    p_error_message,
    p_error_stack,
    p_retry_count,
    CURRENT_TIMESTAMP
  ) RETURNING id INTO v_dlq_id;
  
  -- Update original task status if exists
  UPDATE indexing_queue 
  SET status = 'failed',
      error_message = p_error_message,
      completed_at = CURRENT_TIMESTAMP
  WHERE id = p_task_id;
  
  RETURN v_dlq_id;
END;
$$ LANGUAGE plpgsql;

-- Function to reprocess DLQ items
CREATE OR REPLACE FUNCTION reprocess_dlq_item(p_dlq_id UUID) 
RETURNS UUID AS $$
DECLARE
  v_task_id UUID;
  v_dlq_record RECORD;
BEGIN
  -- Get DLQ record
  SELECT * INTO v_dlq_record
  FROM indexing_dlq
  WHERE id = p_dlq_id AND status = 'pending';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DLQ item not found or not pending: %', p_dlq_id;
  END IF;
  
  -- Create new indexing task
  INSERT INTO indexing_queue (
    entity_type,
    entity_id,
    workspace_id,
    operation,
    priority,
    metadata,
    status,
    created_at
  ) VALUES (
    v_dlq_record.entity_type,
    v_dlq_record.entity_id,
    '00000000-0000-0000-0000-000000000000', -- Will need to be updated with actual workspace
    v_dlq_record.operation,
    10, -- Higher priority for reprocessing
    v_dlq_record.metadata,
    'pending',
    CURRENT_TIMESTAMP
  ) RETURNING id INTO v_task_id;
  
  -- Update DLQ record
  UPDATE indexing_dlq
  SET status = 'reprocessing',
      reprocessed_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = p_dlq_id;
  
  RETURN v_task_id;
END;
$$ LANGUAGE plpgsql;

-- Function to aggregate error statistics
CREATE OR REPLACE FUNCTION aggregate_error_stats() RETURNS void AS $$
BEGIN
  INSERT INTO indexing_error_stats (
    hour_bucket,
    entity_type,
    error_type,
    total_errors,
    total_retries,
    successful_retries,
    dlq_additions,
    avg_retry_count,
    max_retry_count
  )
  SELECT
    date_trunc('hour', occurred_at) as hour_bucket,
    entity_type,
    CASE 
      WHEN error_message ILIKE '%network%' THEN 'network'
      WHEN error_message ILIKE '%rate limit%' THEN 'rate_limit'
      WHEN error_message ILIKE '%database%' THEN 'database'
      WHEN error_message ILIKE '%embedding%' THEN 'embedding'
      ELSE 'other'
    END as error_type,
    COUNT(*) as total_errors,
    SUM(retry_count) as total_retries,
    COUNT(*) FILTER (WHERE resolved_at IS NOT NULL) as successful_retries,
    COUNT(*) FILTER (WHERE retry_count >= 3) as dlq_additions,
    AVG(retry_count) as avg_retry_count,
    MAX(retry_count) as max_retry_count
  FROM indexing_errors
  WHERE occurred_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
  GROUP BY hour_bucket, entity_type, error_type
  ON CONFLICT (hour_bucket, entity_type, error_type) DO UPDATE SET
    total_errors = EXCLUDED.total_errors,
    total_retries = EXCLUDED.total_retries,
    successful_retries = EXCLUDED.successful_retries,
    dlq_additions = EXCLUDED.dlq_additions,
    avg_retry_count = EXCLUDED.avg_retry_count,
    max_retry_count = EXCLUDED.max_retry_count;
END;
$$ LANGUAGE plpgsql;

-- Create a scheduled job to aggregate stats (if pg_cron is available)
-- This is commented out as pg_cron might not be available
-- SELECT cron.schedule('aggregate-error-stats', '0 * * * *', 'SELECT aggregate_error_stats()');

-- Add retry tracking to indexing_queue if not exists
ALTER TABLE indexing_queue 
ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS max_retries INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS retry_delay_ms INTEGER DEFAULT 1000;