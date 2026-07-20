-- Up Migration

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_kind_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_kind_check CHECK (
    kind IN (
      'processing_complete',
      'processing_failed',
      'duplicate_decision_pending',
      'edit_lock_expired',
      'edit_lock_released',
      'break_glass_approval_requested',
      'legal_hold_active',
      'disposal_approval_requested',
      'disposal_execution_ready'
    )
  );

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_target_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_target_type_check CHECK (
    target_type IN (
      'document',
      'document_version',
      'legal_hold',
      'disposal_request',
      'work_item',
      'break_glass_request'
    )
  );

-- Down Migration

DELETE FROM notifications
WHERE kind = 'break_glass_approval_requested'
   OR target_type = 'break_glass_request';

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_target_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_target_type_check CHECK (
    target_type IN (
      'document',
      'document_version',
      'legal_hold',
      'disposal_request',
      'work_item'
    )
  );

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_kind_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_kind_check CHECK (
    kind IN (
      'processing_complete',
      'processing_failed',
      'duplicate_decision_pending',
      'edit_lock_expired',
      'edit_lock_released',
      'legal_hold_active',
      'disposal_approval_requested',
      'disposal_execution_ready'
    )
  );
