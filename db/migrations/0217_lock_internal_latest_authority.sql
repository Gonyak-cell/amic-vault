-- Up Migration

CREATE OR REPLACE FUNCTION app_lock_internal_latest_authority(
  input_tenant_id uuid,
  input_actor_user_id uuid,
  input_document_id uuid,
  input_matter_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF input_tenant_id IS NULL
    OR input_actor_user_id IS NULL
    OR input_document_id IS NULL
    OR input_matter_id IS NULL
    OR nullif(pg_catalog.current_setting('app.current_tenant_id', true), '')::uuid
      IS DISTINCT FROM input_tenant_id THEN
    RETURN false;
  END IF;

  PERFORM 1
  FROM public.users u
  JOIN public.documents d
    ON d.tenant_id = u.tenant_id
   AND d.document_id = input_document_id
  JOIN public.matters m
    ON m.tenant_id = d.tenant_id
   AND m.matter_id = d.matter_id
  JOIN public.matter_members mm
    ON mm.tenant_id = m.tenant_id
   AND mm.matter_id = m.matter_id
   AND mm.user_id = u.user_id
  JOIN public.document_versions v
    ON v.tenant_id = d.tenant_id
   AND v.document_id = d.document_id
   AND v.version_status = 'current'
  JOIN public.file_objects f
    ON f.tenant_id = v.tenant_id
   AND f.file_object_id = v.file_object_id
  JOIN public.file_security_promotions promotion
    ON promotion.tenant_id = v.tenant_id
   AND promotion.document_id = v.document_id
   AND promotion.version_id = v.version_id
   AND promotion.file_object_id = v.file_object_id
  JOIN public.file_security_scans scan
    ON scan.tenant_id = promotion.tenant_id
   AND scan.scan_id = promotion.scan_id
   AND scan.state = 'promoted'
  WHERE u.tenant_id = input_tenant_id
    AND u.user_id = input_actor_user_id
    AND m.matter_id = input_matter_id
  FOR UPDATE OF u, d, m, mm, v, f, promotion, scan;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  PERFORM 1
  FROM public.permissions p
  WHERE p.tenant_id = input_tenant_id
    AND p.resource_type = 'document'
    AND p.resource_id = input_document_id
    AND p.action = 'read'
  FOR UPDATE;

  PERFORM 1
  FROM public.groups g
  JOIN public.group_members gm
    ON gm.tenant_id = g.tenant_id
   AND gm.group_id = g.group_id
  WHERE gm.tenant_id = input_tenant_id
    AND gm.user_id = input_actor_user_id
  FOR UPDATE OF g, gm;

  PERFORM 1
  FROM public.ethical_walls ew
  WHERE ew.tenant_id = input_tenant_id
    AND ew.matter_id = input_matter_id
  FOR UPDATE;

  PERFORM 1
  FROM public.ethical_wall_memberships ewm
  JOIN public.ethical_walls ew
    ON ew.tenant_id = ewm.tenant_id
   AND ew.wall_id = ewm.wall_id
  WHERE ewm.tenant_id = input_tenant_id
    AND ew.matter_id = input_matter_id
  FOR UPDATE OF ewm;

  PERFORM 1
  FROM public.break_glass_requests request
  WHERE request.tenant_id = input_tenant_id
    AND request.matter_id = input_matter_id
    AND request.requester_id = input_actor_user_id
  FOR UPDATE;

  PERFORM 1
  FROM public.break_glass_approvals approval
  JOIN public.break_glass_requests request
    ON request.tenant_id = approval.tenant_id
   AND request.request_id = approval.request_id
  WHERE request.tenant_id = input_tenant_id
    AND request.matter_id = input_matter_id
    AND request.requester_id = input_actor_user_id
  FOR UPDATE OF approval;

  PERFORM 1
  FROM public.canonical_documents cd
  JOIN public.document_versions v
    ON v.tenant_id = cd.tenant_id
   AND v.version_id = cd.version_id
  WHERE cd.tenant_id = input_tenant_id
    AND v.document_id = input_document_id
    AND v.version_status = 'current'
  FOR UPDATE OF cd;

  PERFORM 1
  FROM public.dlp_scan_assessments assessment
  WHERE assessment.tenant_id = input_tenant_id
    AND assessment.document_id = input_document_id
  FOR UPDATE;

  PERFORM 1
  FROM public.dlp_review_decisions review
  JOIN public.dlp_scan_assessments assessment
    ON assessment.tenant_id = review.tenant_id
   AND assessment.assessment_id = review.assessment_id
  WHERE assessment.tenant_id = input_tenant_id
    AND assessment.document_id = input_document_id
  FOR UPDATE OF review;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION app_lock_internal_latest_authority(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_lock_internal_latest_authority(uuid, uuid, uuid, uuid) TO vault_app;

COMMENT ON FUNCTION app_lock_internal_latest_authority(uuid, uuid, uuid, uuid) IS
  'Locks the exact internal latest-read authority rows until transaction end; returns no authority data.';

-- Down Migration

DROP FUNCTION IF EXISTS app_lock_internal_latest_authority(uuid, uuid, uuid, uuid);
