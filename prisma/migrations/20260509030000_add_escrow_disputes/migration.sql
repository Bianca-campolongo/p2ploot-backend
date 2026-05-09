CREATE TABLE `escrow_disputes` (
  `id` CHAR(36) NOT NULL,
  `escrow_deal_id` CHAR(36) NOT NULL,
  `opened_by_id` CHAR(36) NOT NULL,
  `buyer_id` CHAR(36) NOT NULL,
  `seller_id` CHAR(36) NOT NULL,
  `status` VARCHAR(50) NOT NULL DEFAULT 'awaiting_seller_evidence',
  `reason` TEXT NULL,
  `admin_notes` TEXT NULL,
  `resolution` VARCHAR(80) NULL,
  `resolved_by_id` CHAR(36) NULL,
  `resolved_at` DATETIME(3) NULL,
  `metadata` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `escrow_disputes_escrow_deal_id_key`(`escrow_deal_id`),
  INDEX `escrow_disputes_status_created_at_idx`(`status`, `created_at`),
  INDEX `escrow_disputes_buyer_id_status_idx`(`buyer_id`, `status`),
  INDEX `escrow_disputes_seller_id_status_idx`(`seller_id`, `status`),
  INDEX `escrow_disputes_opened_by_id_idx`(`opened_by_id`),
  INDEX `escrow_disputes_resolved_by_id_idx`(`resolved_by_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `escrow_dispute_evidence` (
  `id` CHAR(36) NOT NULL,
  `dispute_id` CHAR(36) NOT NULL,
  `uploaded_by_id` CHAR(36) NULL,
  `kind` VARCHAR(30) NOT NULL,
  `label` VARCHAR(255) NULL,
  `url` VARCHAR(1000) NULL,
  `file_name` VARCHAR(255) NULL,
  `mime_type` VARCHAR(255) NULL,
  `size_bytes` INTEGER NULL,
  `text` TEXT NULL,
  `metadata` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `escrow_dispute_evidence_dispute_id_created_at_idx`(`dispute_id`, `created_at`),
  INDEX `escrow_dispute_evidence_uploaded_by_id_idx`(`uploaded_by_id`),
  INDEX `escrow_dispute_evidence_kind_idx`(`kind`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `escrow_disputes`
  ADD CONSTRAINT `escrow_disputes_escrow_deal_id_fkey`
  FOREIGN KEY (`escrow_deal_id`) REFERENCES `escrow_deals`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `escrow_disputes`
  ADD CONSTRAINT `escrow_disputes_opened_by_id_fkey`
  FOREIGN KEY (`opened_by_id`) REFERENCES `profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `escrow_disputes`
  ADD CONSTRAINT `escrow_disputes_buyer_id_fkey`
  FOREIGN KEY (`buyer_id`) REFERENCES `profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `escrow_disputes`
  ADD CONSTRAINT `escrow_disputes_seller_id_fkey`
  FOREIGN KEY (`seller_id`) REFERENCES `profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `escrow_disputes`
  ADD CONSTRAINT `escrow_disputes_resolved_by_id_fkey`
  FOREIGN KEY (`resolved_by_id`) REFERENCES `profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `escrow_dispute_evidence`
  ADD CONSTRAINT `escrow_dispute_evidence_dispute_id_fkey`
  FOREIGN KEY (`dispute_id`) REFERENCES `escrow_disputes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `escrow_dispute_evidence`
  ADD CONSTRAINT `escrow_dispute_evidence_uploaded_by_id_fkey`
  FOREIGN KEY (`uploaded_by_id`) REFERENCES `profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
