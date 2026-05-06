-- Link P2P Loot profiles to verified Privy users.
ALTER TABLE `profiles`
  ADD COLUMN `privy_id` VARCHAR(255) NULL,
  ADD COLUMN `privy_linked_at` DATETIME(3) NULL,
  ADD UNIQUE INDEX `profiles_privy_id_key` (`privy_id`);
