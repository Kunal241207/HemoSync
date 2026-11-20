-- CreateEnum
CREATE TYPE "InstitutionType" AS ENUM ('HOSPITAL', 'BLOOD_BANK');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PLATFORM_ADMIN', 'HOSPITAL_STAFF', 'BLOOD_BANK_STAFF');

-- CreateEnum
CREATE TYPE "BloodComponentType" AS ENUM ('RED_BLOOD_CELLS', 'PLATELETS', 'PLASMA');

-- CreateEnum
CREATE TYPE "AboGroup" AS ENUM ('A', 'B', 'AB', 'O');

-- CreateEnum
CREATE TYPE "RhFactor" AS ENUM ('POSITIVE', 'NEGATIVE');

-- CreateEnum
CREATE TYPE "TestingStatus" AS ENUM ('PENDING', 'PASSED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReleaseStatus" AS ENUM ('QUARANTINED', 'RELEASED', 'REJECTED');

-- CreateEnum
CREATE TYPE "InventoryStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'IN_TRANSFER', 'TRANSFERRED', 'USED', 'EXPIRED', 'DISCARDED', 'QUARANTINED');

-- CreateEnum
CREATE TYPE "RequestUrgency" AS ENUM ('ROUTINE', 'URGENT', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'VALIDATED', 'PARTIALLY_ALLOCATED', 'ALLOCATED', 'TRANSFER_PENDING', 'FULFILLED', 'CANCELLED', 'UNFULFILLED');

-- CreateEnum
CREATE TYPE "AllocationStatus" AS ENUM ('RESERVED', 'FULFILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'RESERVED', 'DISPATCHED', 'RECEIVED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('REGISTRATION', 'STATUS_CHANGE', 'DISPATCH', 'RECEIPT', 'DISPOSAL', 'QUARANTINE_APPLIED', 'TEST_COMPLETED', 'ALLOCATION_RESERVED', 'ALLOCATION_RELEASED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'ALLOCATE', 'TRANSFER_REQUEST', 'TRANSFER_APPROVE', 'TRANSFER_DISPATCH', 'TRANSFER_RECEIVE', 'STATUS_CHANGE');

-- CreateTable
CREATE TABLE "institutions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "InstitutionType" NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "license_number" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "institutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blood_units" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "unit_code" TEXT NOT NULL,
    "component_type" "BloodComponentType" NOT NULL,
    "abo_group" "AboGroup" NOT NULL,
    "rh_factor" "RhFactor" NOT NULL,
    "collection_date" TIMESTAMP(3) NOT NULL,
    "expiry_date" TIMESTAMP(3) NOT NULL,
    "volume_ml" INTEGER NOT NULL,
    "testing_status" "TestingStatus" NOT NULL DEFAULT 'PENDING',
    "release_status" "ReleaseStatus" NOT NULL DEFAULT 'QUARANTINED',
    "inventory_status" "InventoryStatus" NOT NULL DEFAULT 'AVAILABLE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blood_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blood_requests" (
    "id" TEXT NOT NULL,
    "hospital_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "requested_component" "BloodComponentType" NOT NULL,
    "requested_abo" "AboGroup" NOT NULL,
    "requested_rh" "RhFactor" NOT NULL,
    "requested_quantity" INTEGER NOT NULL,
    "urgency" "RequestUrgency" NOT NULL DEFAULT 'ROUTINE',
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "required_by" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blood_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allocations" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "blood_unit_id" TEXT NOT NULL,
    "allocated_by_id" TEXT NOT NULL,
    "status" "AllocationStatus" NOT NULL DEFAULT 'RESERVED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfers" (
    "id" TEXT NOT NULL,
    "source_institution_id" TEXT NOT NULL,
    "destination_institution_id" TEXT NOT NULL,
    "request_id" TEXT,
    "status" "TransferStatus" NOT NULL DEFAULT 'REQUESTED',
    "approved_by_id" TEXT,
    "dispatched_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfer_units" (
    "id" TEXT NOT NULL,
    "transfer_id" TEXT NOT NULL,
    "blood_unit_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transfer_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expiry_alerts" (
    "id" TEXT NOT NULL,
    "blood_unit_id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "severity" "AlertSeverity" NOT NULL DEFAULT 'MEDIUM',
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expiry_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "recipient_user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demand_forecasts" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "component_type" "BloodComponentType" NOT NULL,
    "abo_group" "AboGroup",
    "rh_factor" "RhFactor",
    "forecast_date" TIMESTAMP(3) NOT NULL,
    "horizon_days" INTEGER NOT NULL DEFAULT 7,
    "predicted_demand" DOUBLE PRECISION NOT NULL,
    "lower_bound" DOUBLE PRECISION NOT NULL,
    "upper_bound" DOUBLE PRECISION NOT NULL,
    "model_version" TEXT NOT NULL DEFAULT 'v1.0-ewma',
    "metrics" JSONB,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demand_forecasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT,
    "institution_id" TEXT,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_events" (
    "id" TEXT NOT NULL,
    "blood_unit_id" TEXT NOT NULL,
    "event_type" "EventType" NOT NULL,
    "previous_status" "InventoryStatus",
    "new_status" "InventoryStatus" NOT NULL,
    "actor_id" TEXT,
    "notes" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "institutions_license_number_key" ON "institutions"("license_number");

-- CreateIndex
CREATE INDEX "institutions_type_verification_status_is_active_idx" ON "institutions"("type", "verification_status", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_institution_id_role_idx" ON "users"("institution_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "blood_units_unit_code_key" ON "blood_units"("unit_code");

-- CreateIndex
CREATE INDEX "blood_units_institution_id_inventory_status_idx" ON "blood_units"("institution_id", "inventory_status");

-- CreateIndex
CREATE INDEX "blood_units_component_type_abo_group_rh_factor_idx" ON "blood_units"("component_type", "abo_group", "rh_factor");

-- CreateIndex
CREATE INDEX "blood_units_expiry_date_idx" ON "blood_units"("expiry_date");

-- CreateIndex
CREATE INDEX "blood_units_inventory_status_release_status_testing_status_idx" ON "blood_units"("inventory_status", "release_status", "testing_status");

-- CreateIndex
CREATE INDEX "blood_requests_hospital_id_status_idx" ON "blood_requests"("hospital_id", "status");

-- CreateIndex
CREATE INDEX "blood_requests_required_by_idx" ON "blood_requests"("required_by");

-- CreateIndex
CREATE INDEX "blood_requests_urgency_idx" ON "blood_requests"("urgency");

-- CreateIndex
CREATE INDEX "allocations_request_id_idx" ON "allocations"("request_id");

-- CreateIndex
CREATE INDEX "allocations_blood_unit_id_status_idx" ON "allocations"("blood_unit_id", "status");

-- CreateIndex
CREATE INDEX "transfers_source_institution_id_status_idx" ON "transfers"("source_institution_id", "status");

-- CreateIndex
CREATE INDEX "transfers_destination_institution_id_status_idx" ON "transfers"("destination_institution_id", "status");

-- CreateIndex
CREATE INDEX "transfers_request_id_idx" ON "transfers"("request_id");

-- CreateIndex
CREATE INDEX "transfer_units_blood_unit_id_idx" ON "transfer_units"("blood_unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "transfer_units_transfer_id_blood_unit_id_key" ON "transfer_units"("transfer_id", "blood_unit_id");

-- CreateIndex
CREATE INDEX "expiry_alerts_institution_id_resolved_idx" ON "expiry_alerts"("institution_id", "resolved");

-- CreateIndex
CREATE INDEX "expiry_alerts_blood_unit_id_idx" ON "expiry_alerts"("blood_unit_id");

-- CreateIndex
CREATE INDEX "notifications_recipient_user_id_read_at_idx" ON "notifications"("recipient_user_id", "read_at");

-- CreateIndex
CREATE INDEX "demand_forecasts_institution_id_component_type_forecast_dat_idx" ON "demand_forecasts"("institution_id", "component_type", "forecast_date");

-- CreateIndex
CREATE INDEX "audit_logs_institution_id_created_at_idx" ON "audit_logs"("institution_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "inventory_events_blood_unit_id_timestamp_idx" ON "inventory_events"("blood_unit_id", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings"("key");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blood_units" ADD CONSTRAINT "blood_units_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blood_requests" ADD CONSTRAINT "blood_requests_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blood_requests" ADD CONSTRAINT "blood_requests_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "blood_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_blood_unit_id_fkey" FOREIGN KEY ("blood_unit_id") REFERENCES "blood_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_allocated_by_id_fkey" FOREIGN KEY ("allocated_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_source_institution_id_fkey" FOREIGN KEY ("source_institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_destination_institution_id_fkey" FOREIGN KEY ("destination_institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "blood_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_units" ADD CONSTRAINT "transfer_units_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_units" ADD CONSTRAINT "transfer_units_blood_unit_id_fkey" FOREIGN KEY ("blood_unit_id") REFERENCES "blood_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expiry_alerts" ADD CONSTRAINT "expiry_alerts_blood_unit_id_fkey" FOREIGN KEY ("blood_unit_id") REFERENCES "blood_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expiry_alerts" ADD CONSTRAINT "expiry_alerts_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_forecasts" ADD CONSTRAINT "demand_forecasts_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_events" ADD CONSTRAINT "inventory_events_blood_unit_id_fkey" FOREIGN KEY ("blood_unit_id") REFERENCES "blood_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_events" ADD CONSTRAINT "inventory_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
