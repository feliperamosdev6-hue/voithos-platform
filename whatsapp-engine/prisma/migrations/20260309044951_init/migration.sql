-- CreateEnum
CREATE TYPE "InstanceStatus" AS ENUM ('CREATED', 'CONNECTING', 'CONNECTED', 'DISCONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "MessageJobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SENT', 'FAILED', 'SCHEDULED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "MessageEventType" AS ENUM ('QUEUED', 'PROCESSING', 'SENT', 'FAILED', 'RETRYING');

-- CreateTable
CREATE TABLE "whatsapp_instances" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "status" "InstanceStatus" NOT NULL DEFAULT 'CREATED',
    "phone_number" TEXT,
    "display_name" TEXT,
    "auth_blob_encrypted" TEXT,
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_jobs" (
    "id" TEXT NOT NULL,
    "clinic_id" TEXT NOT NULL,
    "instance_id" TEXT NOT NULL,
    "appointment_id" TEXT,
    "to_phone" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "scheduled_for" TIMESTAMP(3),
    "status" "MessageJobStatus" NOT NULL DEFAULT 'QUEUED',
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_logs" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "provider_message_id" TEXT,
    "event_type" "MessageEventType" NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_instances_clinic_id_key" ON "whatsapp_instances"("clinic_id");

-- CreateIndex
CREATE INDEX "message_jobs_clinic_id_idx" ON "message_jobs"("clinic_id");

-- CreateIndex
CREATE INDEX "message_jobs_instance_id_idx" ON "message_jobs"("instance_id");

-- CreateIndex
CREATE INDEX "message_jobs_status_idx" ON "message_jobs"("status");

-- CreateIndex
CREATE INDEX "message_logs_job_id_idx" ON "message_logs"("job_id");

-- AddForeignKey
ALTER TABLE "message_jobs" ADD CONSTRAINT "message_jobs_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "whatsapp_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "message_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
