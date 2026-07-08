-- Migration: extend_device_specs
-- Adds assetNumber + 20 new hardware/assignment/import fields to Device.
-- Makes serialNumber and makeModel nullable (import data is often incomplete).

-- Make existing required columns nullable
ALTER TABLE "Device" ALTER COLUMN "makeModel" DROP NOT NULL;
ALTER TABLE "Device" ALTER COLUMN "serialNumber" DROP NOT NULL;

-- Add new columns (all nullable so existing rows are unaffected)
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "assetNumber"       TEXT;
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "cpu"               TEXT;
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "ram"               TEXT;
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "storage"           TEXT;
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "macAddress"        TEXT;
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "osVersion"         TEXT;
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "osKey"             TEXT;
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "antiVirus"         TEXT;
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "officeVersion"     TEXT;
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "officeKey"         TEXT;
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "assignedToName"    TEXT;
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "assignedToProject" TEXT;
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "previousUser"      TEXT;
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "assetCategory"     TEXT;
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "rentedFrom"        TEXT;
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "rentedDate"        TIMESTAMP(3);
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "returnedDate"      TIMESTAMP(3);
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "remarks"           TEXT;
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "importedFrom"      TEXT;
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "importedAt"        TIMESTAMP(3);

-- Unique index on assetNumber (nulls are allowed in unique indexes by PostgreSQL)
CREATE UNIQUE INDEX IF NOT EXISTS "Device_assetNumber_key" ON "Device"("assetNumber");
