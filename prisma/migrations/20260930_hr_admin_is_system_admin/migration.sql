-- The HR Administrator is also the system administrator.
--
-- At Hylink one person runs both HR and administration, so the HR_ADMIN role
-- is given what Super Administrator holds: every permission except
-- LOANS:CREATE, which stays exclusive to Loan Officers. That includes
-- ADMIN:SYSTEM (Branches, sales confirmation), SYSTEM:CONFIG_MANAGE
-- (Configuration, Organisation) and HR:PAYROLL_APPROVE.
--
-- Separation of duties still holds per record: whoever processes a payroll
-- run can never approve that same run (payroll.actions approvePayroll), and
-- nobody confirms their own marketing sale.
--
-- Data only; no schema change. Adds missing grants and removes none, so it is
-- safe to run again. Staff with this role must sign out and back in for the
-- new permissions to reach their session.

INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "createdAt")
SELECT gen_random_uuid()::text, r."id", p."id", CURRENT_TIMESTAMP
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r."code" = 'HR_ADMIN'
  AND p."code" <> 'LOANS:CREATE'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
