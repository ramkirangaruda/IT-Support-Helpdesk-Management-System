-- Add IMEI and Apple ID fields for smart device inventory
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "imei"    TEXT;
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "appleId" TEXT;

-- Remove unique constraint on serialNumber so model numbers (which repeat
-- across multiple units of the same model) can be stored without conflicts.
-- assetNumber is the primary unique identifier for imported devices.
DROP INDEX IF EXISTS "Device_serialNumber_key";
