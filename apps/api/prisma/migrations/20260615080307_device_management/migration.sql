-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('AVAILABLE', 'ALLOCATED', 'IN_REPAIR', 'RETIRED');

-- CreateEnum
CREATE TYPE "DeviceRequestStatus" AS ENUM ('SUBMITTED', 'PENDING_MANAGER_APPROVAL', 'APPROVED', 'REJECTED', 'PENDING_FULFILMENT', 'ALLOCATED', 'RETURN_REQUESTED', 'RETURNED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "makeModel" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "status" "DeviceStatus" NOT NULL DEFAULT 'AVAILABLE',
    "condition" TEXT,
    "purchasedOn" TIMESTAMP(3),
    "cost" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "managerId" TEXT,
    "deviceType" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "status" "DeviceRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceAllocation" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "requestId" TEXT,
    "allocatedOn" TIMESTAMP(3) NOT NULL,
    "expectedReturn" TIMESTAMP(3),
    "returnedOn" TIMESTAMP(3),
    "conditionAtIssue" TEXT NOT NULL,
    "conditionAtReturn" TEXT,

    CONSTRAINT "DeviceAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Device_serialNumber_key" ON "Device"("serialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceAllocation_requestId_key" ON "DeviceAllocation"("requestId");

-- AddForeignKey
ALTER TABLE "DeviceRequest" ADD CONSTRAINT "DeviceRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceRequest" ADD CONSTRAINT "DeviceRequest_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceAllocation" ADD CONSTRAINT "DeviceAllocation_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceAllocation" ADD CONSTRAINT "DeviceAllocation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceAllocation" ADD CONSTRAINT "DeviceAllocation_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "DeviceRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
