-- Up Migration

WITH unthreaded AS (
  SELECT
    tenant_id,
    email_id,
    COALESCE(references_json->>0, message_id_hash) AS root_message_id_hash,
    conversation_id_hash
  FROM email_messages
  WHERE thread_id IS NULL
    AND parse_status = 'parsed'
),
inserted_threads AS (
  INSERT INTO email_threads (tenant_id, root_message_id_hash, conversation_id_hash)
  SELECT
    u.tenant_id,
    u.root_message_id_hash,
    min(u.conversation_id_hash) FILTER (WHERE u.conversation_id_hash IS NOT NULL) AS conversation_id_hash
  FROM unthreaded
  u
  WHERE NOT EXISTS (
    SELECT 1
    FROM email_threads t
    WHERE t.tenant_id = u.tenant_id
      AND t.root_message_id_hash = u.root_message_id_hash
  )
  GROUP BY u.tenant_id, u.root_message_id_hash
  RETURNING tenant_id, thread_id, root_message_id_hash
),
all_threads AS (
  SELECT DISTINCT ON (tenant_id, root_message_id_hash)
    tenant_id, thread_id, root_message_id_hash
  FROM (
    SELECT tenant_id, thread_id, root_message_id_hash, created_at
    FROM email_threads
    UNION ALL
    SELECT tenant_id, thread_id, root_message_id_hash, now() AS created_at
    FROM inserted_threads
  ) threads
  ORDER BY tenant_id, root_message_id_hash, created_at ASC, thread_id ASC
)
UPDATE email_messages e
SET thread_id = t.thread_id
FROM unthreaded u
JOIN all_threads t
  ON t.tenant_id = u.tenant_id
 AND t.root_message_id_hash = u.root_message_id_hash
WHERE e.tenant_id = u.tenant_id
  AND e.email_id = u.email_id
  AND e.thread_id IS NULL;

COMMENT ON COLUMN email_messages.thread_id IS
  'C12 thread assignment. Backfilled parsed historical rows and assigned on new imports from hashed Message-ID references.';

-- Down Migration

UPDATE email_messages
SET thread_id = NULL,
    conversation_id_hash = NULL
WHERE thread_id IS NOT NULL;

DELETE FROM email_threads;
