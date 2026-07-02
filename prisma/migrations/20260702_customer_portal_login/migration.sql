-- Migration: Customer portal login fields
-- Hylink Finance Limited EMS
-- Generated: 2026-07-02

ALTER TABLE "Customer"
  ADD COLUMN IF NOT EXISTS "passwordHash"         TEXT,
  ADD COLUMN IF NOT EXISTS "portalEnabled"        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "mustResetPassword"    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "portalLastLoginAt"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "portalFailedAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "portalLockedUntil"    TIMESTAMP(3);
