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
      'legal_hold_active',
      'disposal_approval_requested',
      'disposal_execution_ready'
    )
  );

-- Down Migration

DELETE FROM notifications
WHERE kind = 'edit_lock_expired';

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_kind_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_kind_check CHECK (
    kind IN (
      'processing_complete',
      'processing_failed',
      'duplicate_decision_pending',
      'legal_hold_active',
      'disposal_approval_requested',
      'disposal_execution_ready'
    )
  );
