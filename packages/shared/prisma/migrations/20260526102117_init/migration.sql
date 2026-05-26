-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('pending', 'sent', 'delivered', 'error', 'clicked', 'unsubscribed');

-- CreateTable
CREATE TABLE "user" (
    "user_id" BIGSERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "country_code" INTEGER,
    "phone_number" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "device" (
    "id" BIGSERIAL NOT NULL,
    "device_token" TEXT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "last_logged_in_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_setting" (
    "user_id" BIGINT NOT NULL,
    "channel" TEXT NOT NULL,
    "opt_in" BOOLEAN NOT NULL,

    CONSTRAINT "notification_setting_pkey" PRIMARY KEY ("user_id","channel")
);

-- CreateTable
CREATE TABLE "notification_log" (
    "id" BIGSERIAL NOT NULL,
    "event_id" TEXT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "notification_log_event_id_idx" ON "notification_log"("event_id");

-- AddForeignKey
ALTER TABLE "device" ADD CONSTRAINT "device_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_setting" ADD CONSTRAINT "notification_setting_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
