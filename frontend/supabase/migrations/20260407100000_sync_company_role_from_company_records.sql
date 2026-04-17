CREATE OR REPLACE FUNCTION public.sync_company_role_from_company_record()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.verified, false) = true OR NEW.verification_status = 'approved' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.user_id, 'company')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

INSERT INTO public.user_roles (user_id, role)
SELECT c.user_id, 'company'::public.app_role
FROM public.companies c
WHERE c.user_id IS NOT NULL
  AND (
    COALESCE(c.verified, false) = true
    OR c.verification_status = 'approved'
  )
ON CONFLICT (user_id, role) DO NOTHING;

DROP TRIGGER IF EXISTS sync_company_role_from_company_record ON public.companies;
CREATE TRIGGER sync_company_role_from_company_record
AFTER INSERT OR UPDATE OF verified, verification_status ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.sync_company_role_from_company_record();
