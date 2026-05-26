-- CreateTable
CREATE TABLE "app_credential" (
    "app_key" TEXT NOT NULL,
    "hashed_secret" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_credential_pkey" PRIMARY KEY ("app_key")
);
