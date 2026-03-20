/*
  Warnings:

  - You are about to drop the column `recurrence` on the `guild_dkp_events_config` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `guild_custom_fields` ADD COLUMN `options` JSON NULL;

-- AlterTable
ALTER TABLE `guild_dkp_events_config` DROP COLUMN `recurrence`;
