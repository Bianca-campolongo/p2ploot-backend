/*
  Warnings:

  - You are about to alter the column `dkp_amount` on the `guild_dkp_events_config` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Decimal(10,2)`.
  - You are about to alter the column `amount` on the `guild_dkp_ledger` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Decimal(10,2)`.
  - You are about to alter the column `dkp_balance` on the `guild_members` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Decimal(10,2)`.

*/
-- AlterTable
ALTER TABLE `guild_auctions` ADD COLUMN `delivered` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `guild_dkp_events_config` ADD COLUMN `event_time` VARCHAR(10) NULL,
    ADD COLUMN `recurrence` VARCHAR(50) NOT NULL DEFAULT 'once',
    ADD COLUMN `recurrence_days` VARCHAR(255) NULL,
    MODIFY `dkp_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `guild_dkp_ledger` MODIFY `amount` DECIMAL(10, 2) NOT NULL;

-- AlterTable
ALTER TABLE `guild_members` MODIFY `dkp_balance` DECIMAL(10, 2) NOT NULL DEFAULT 0;
