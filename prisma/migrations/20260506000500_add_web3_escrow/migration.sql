-- Web3 baseline: Solana wallet linkage and marketplace escrow audit trail.

CREATE TABLE `web3_wallets` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `chain` VARCHAR(50) NOT NULL DEFAULT 'solana',
    `network` VARCHAR(50) NOT NULL DEFAULT 'devnet',
    `address` VARCHAR(128) NOT NULL,
    `provider` VARCHAR(50) NOT NULL DEFAULT 'privy',
    `provider_user_id` VARCHAR(255) NULL,
    `wallet_type` VARCHAR(50) NULL,
    `is_primary` BOOLEAN NOT NULL DEFAULT false,
    `last_seen_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `web3_wallets_user_id_chain_network_is_primary_idx`(`user_id`, `chain`, `network`, `is_primary`),
    INDEX `web3_wallets_address_idx`(`address`),
    UNIQUE INDEX `web3_wallets_chain_network_address_key`(`chain`, `network`, `address`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `escrow_deals` (
    `id` CHAR(36) NOT NULL,
    `conversation_id` CHAR(36) NULL,
    `ad_id` BIGINT NULL,
    `buyer_id` CHAR(36) NOT NULL,
    `seller_id` CHAR(36) NOT NULL,
    `created_by_id` CHAR(36) NOT NULL,
    `chain` VARCHAR(50) NOT NULL DEFAULT 'solana',
    `network` VARCHAR(50) NOT NULL DEFAULT 'devnet',
    `program_id` VARCHAR(128) NULL,
    `asset_mint` VARCHAR(128) NULL,
    `currency_symbol` VARCHAR(20) NULL,
    `amount_raw` VARCHAR(80) NULL,
    `amount_ui` DECIMAL(20, 9) NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'draft',
    `escrow_pda` VARCHAR(128) NULL,
    `vault_address` VARCHAR(128) NULL,
    `deposit_tx` VARCHAR(128) NULL,
    `release_tx` VARCHAR(128) NULL,
    `refund_tx` VARCHAR(128) NULL,
    `cancel_tx` VARCHAR(128) NULL,
    `seller_confirm_tx` VARCHAR(128) NULL,
    `expires_at` DATETIME(3) NULL,
    `funded_at` DATETIME(3) NULL,
    `seller_confirmed_at` DATETIME(3) NULL,
    `released_at` DATETIME(3) NULL,
    `refunded_at` DATETIME(3) NULL,
    `cancelled_at` DATETIME(3) NULL,
    `disputed_at` DATETIME(3) NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `escrow_deals_conversation_id_status_idx`(`conversation_id`, `status`),
    INDEX `escrow_deals_buyer_id_status_idx`(`buyer_id`, `status`),
    INDEX `escrow_deals_seller_id_status_idx`(`seller_id`, `status`),
    INDEX `escrow_deals_created_by_id_idx`(`created_by_id`),
    INDEX `escrow_deals_ad_id_idx`(`ad_id`),
    INDEX `escrow_deals_deposit_tx_idx`(`deposit_tx`),
    INDEX `escrow_deals_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `escrow_events` (
    `id` CHAR(36) NOT NULL,
    `deal_id` CHAR(36) NOT NULL,
    `actor_id` CHAR(36) NULL,
    `type` VARCHAR(50) NOT NULL,
    `status_snapshot` VARCHAR(50) NULL,
    `tx_signature` VARCHAR(128) NULL,
    `message` TEXT NULL,
    `payload` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `escrow_events_deal_id_created_at_idx`(`deal_id`, `created_at`),
    INDEX `escrow_events_actor_id_idx`(`actor_id`),
    INDEX `escrow_events_tx_signature_idx`(`tx_signature`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `web3_wallets`
    ADD CONSTRAINT `web3_wallets_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `escrow_deals`
    ADD CONSTRAINT `escrow_deals_conversation_id_fkey`
    FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `escrow_deals`
    ADD CONSTRAINT `escrow_deals_ad_id_fkey`
    FOREIGN KEY (`ad_id`) REFERENCES `market_ads`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `escrow_deals`
    ADD CONSTRAINT `escrow_deals_buyer_id_fkey`
    FOREIGN KEY (`buyer_id`) REFERENCES `profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `escrow_deals`
    ADD CONSTRAINT `escrow_deals_seller_id_fkey`
    FOREIGN KEY (`seller_id`) REFERENCES `profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `escrow_deals`
    ADD CONSTRAINT `escrow_deals_created_by_id_fkey`
    FOREIGN KEY (`created_by_id`) REFERENCES `profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `escrow_events`
    ADD CONSTRAINT `escrow_events_deal_id_fkey`
    FOREIGN KEY (`deal_id`) REFERENCES `escrow_deals`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `escrow_events`
    ADD CONSTRAINT `escrow_events_actor_id_fkey`
    FOREIGN KEY (`actor_id`) REFERENCES `profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
