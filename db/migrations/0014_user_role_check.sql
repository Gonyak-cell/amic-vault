-- Up Migration

ALTER TABLE users ADD COLUMN IF NOT EXISTS practice_group text;

UPDATE users
SET role = CASE role
  WHEN 'Firm Admin' THEN 'firm_admin'
  WHEN 'Security Admin' THEN 'security_admin'
  WHEN 'Matter Owner' THEN 'matter_owner'
  WHEN 'Matter Member' THEN 'matter_member'
  WHEN 'Limited Reviewer' THEN 'limited_reviewer'
  WHEN 'Knowledge Manager' THEN 'knowledge_manager'
  WHEN 'External User' THEN 'external_user'
  ELSE role
END;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (
    role IN (
      'firm_admin',
      'security_admin',
      'matter_owner',
      'matter_member',
      'limited_reviewer',
      'knowledge_manager',
      'external_user'
    )
  );

-- Down Migration

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_role_check;

