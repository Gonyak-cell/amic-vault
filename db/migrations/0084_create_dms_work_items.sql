-- Up Migration

CREATE TABLE work_items (
  work_item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
  source text NOT NULL CHECK (source IN ('records')),
  kind text NOT NULL CHECK (kind IN ('records_disposal_approval', 'records_disposal_execution')),
  target_type text NOT NULL CHECK (target_type IN ('disposal_request')),
  target_id uuid NOT NULL,
  matter_id uuid NOT NULL,
  document_id uuid,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
  assignment_scope text NOT NULL DEFAULT 'records_admin'
    CHECK (assignment_scope IN ('records_admin', 'user')),
  assigned_to_user_id uuid,
  due_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  completed_by uuid,
  completed_at timestamptz,
  created_audit_event_id uuid NOT NULL,
  last_audit_event_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, work_item_id),
  UNIQUE (tenant_id, source, kind, target_type, target_id),
  CONSTRAINT work_items_assignment_check CHECK (
    (assignment_scope = 'records_admin' AND assigned_to_user_id IS NULL)
    OR (assignment_scope = 'user' AND assigned_to_user_id IS NOT NULL)
  ),
  CONSTRAINT work_items_completion_check CHECK (
    (status IN ('open', 'in_progress') AND completed_by IS NULL AND completed_at IS NULL)
    OR (status IN ('completed', 'cancelled') AND completed_by IS NOT NULL AND completed_at IS NOT NULL)
  ),
  CONSTRAINT fk_work_items_matter
    FOREIGN KEY (tenant_id, matter_id)
    REFERENCES matters (tenant_id, matter_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_work_items_target_disposal
    FOREIGN KEY (tenant_id, target_id)
    REFERENCES disposal_requests (tenant_id, disposal_request_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_work_items_assigned_to_user
    FOREIGN KEY (tenant_id, assigned_to_user_id)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_work_items_created_by
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_work_items_completed_by
    FOREIGN KEY (tenant_id, completed_by)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_work_items_created_audit
    FOREIGN KEY (tenant_id, created_audit_event_id)
    REFERENCES audit_events (tenant_id, event_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_work_items_last_audit
    FOREIGN KEY (tenant_id, last_audit_event_id)
    REFERENCES audit_events (tenant_id, event_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_work_items_tenant_status_due
  ON work_items (tenant_id, status, due_at ASC, updated_at DESC);

CREATE INDEX idx_work_items_tenant_matter
  ON work_items (tenant_id, matter_id, status, updated_at DESC);

ALTER TABLE work_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_items FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_work_items_tenant ON work_items
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON work_items TO vault_app;
GRANT UPDATE (
  status,
  assigned_to_user_id,
  due_at,
  completed_by,
  completed_at,
  last_audit_event_id,
  updated_at
) ON work_items TO vault_app;

ALTER TABLE disposal_requests
  ADD COLUMN assigned_to_user_id uuid,
  ADD COLUMN assigned_role text NOT NULL DEFAULT 'records_admin'
    CHECK (assigned_role IN ('records_admin')),
  ADD COLUMN due_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  ADD COLUMN workflow_item_id uuid,
  ADD COLUMN workflow_audit_event_id uuid,
  ADD CONSTRAINT fk_disposal_requests_assigned_to_user
    FOREIGN KEY (tenant_id, assigned_to_user_id)
    REFERENCES users (tenant_id, user_id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT fk_disposal_requests_workflow_item
    FOREIGN KEY (tenant_id, workflow_item_id)
    REFERENCES work_items (tenant_id, work_item_id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT fk_disposal_requests_workflow_audit
    FOREIGN KEY (tenant_id, workflow_audit_event_id)
    REFERENCES audit_events (tenant_id, event_id)
    ON DELETE RESTRICT;

CREATE INDEX idx_disposal_requests_tenant_assignee_due
  ON disposal_requests (tenant_id, assigned_role, assigned_to_user_id, due_at, status);

GRANT UPDATE (
  assigned_to_user_id,
  due_at,
  workflow_item_id,
  workflow_audit_event_id
) ON disposal_requests TO vault_app;

COMMENT ON TABLE work_items IS
  'Tenant-scoped persisted DMS task inbox. Rows store references, status, assignment scope, due dates, and audit refs only.';
COMMENT ON COLUMN work_items.document_id IS
  'Reference-only document UUID. No FK so approved records disposal can delete document/file rows while retaining workflow history.';
COMMENT ON COLUMN disposal_requests.workflow_item_id IS
  'Current persisted work item for the disposal approval or execution stage.';
COMMENT ON COLUMN disposal_requests.workflow_audit_event_id IS
  'Reference to the audit event that opened or advanced the current workflow stage.';

-- Down Migration

ALTER TABLE disposal_requests
  DROP CONSTRAINT IF EXISTS fk_disposal_requests_workflow_audit,
  DROP CONSTRAINT IF EXISTS fk_disposal_requests_workflow_item,
  DROP CONSTRAINT IF EXISTS fk_disposal_requests_assigned_to_user;

DROP INDEX IF EXISTS idx_disposal_requests_tenant_assignee_due;

ALTER TABLE disposal_requests
  DROP COLUMN IF EXISTS workflow_audit_event_id,
  DROP COLUMN IF EXISTS workflow_item_id,
  DROP COLUMN IF EXISTS due_at,
  DROP COLUMN IF EXISTS assigned_role,
  DROP COLUMN IF EXISTS assigned_to_user_id;

DROP TABLE IF EXISTS work_items;
