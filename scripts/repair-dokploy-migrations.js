const mysql = require("mysql2/promise");

const ENABLED = process.env.DOKPLOY_PRISMA_REPAIR_FAILED_MIGRATIONS === "true";
const TARGET_MIGRATION = "20260318152623_add_delivered_to_auction";

function parseDatabaseUrl() {
  const rawUrl = process.env.DATABASE_URL;

  if (!rawUrl) {
    throw new Error("DATABASE_URL is required for migration repair");
  }

  const url = new URL(rawUrl);
  const allowedHosts = (
    process.env.DOKPLOY_PRISMA_REPAIR_ALLOWED_HOSTS || "p2p-loot-db-5a5aun"
  )
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);

  if (!allowedHosts.includes(url.hostname)) {
    throw new Error(
      `Refusing migration repair on unexpected DB host: ${url.hostname}`
    );
  }

  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
  };
}

async function columnExists(connection, tableName, columnName) {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS total
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );

  return Number(rows[0].total) > 0;
}

async function addColumnIfMissing(connection, tableName, columnName, ddl) {
  if (await columnExists(connection, tableName, columnName)) {
    return;
  }

  await connection.query(`ALTER TABLE \`${tableName}\` ADD COLUMN ${ddl}`);
  console.log(`[migration-repair] added ${tableName}.${columnName}`);
}

async function repairDeliveredAuctionMigration(connection) {
  await addColumnIfMissing(
    connection,
    "guild_auctions",
    "delivered",
    "`delivered` BOOLEAN NOT NULL DEFAULT false"
  );
  await addColumnIfMissing(
    connection,
    "guild_dkp_events_config",
    "event_time",
    "`event_time` VARCHAR(10) NULL"
  );
  await addColumnIfMissing(
    connection,
    "guild_dkp_events_config",
    "recurrence",
    "`recurrence` VARCHAR(50) NOT NULL DEFAULT 'once'"
  );
  await addColumnIfMissing(
    connection,
    "guild_dkp_events_config",
    "recurrence_days",
    "`recurrence_days` VARCHAR(255) NULL"
  );

  await connection.query(
    "ALTER TABLE `guild_dkp_events_config` MODIFY `dkp_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0"
  );
  await connection.query(
    "ALTER TABLE `guild_dkp_ledger` MODIFY `amount` DECIMAL(10, 2) NOT NULL"
  );
  await connection.query(
    "ALTER TABLE `guild_members` MODIFY `dkp_balance` DECIMAL(10, 2) NOT NULL DEFAULT 0"
  );

  const [result] = await connection.execute(
    `UPDATE _prisma_migrations
        SET finished_at = COALESCE(finished_at, NOW(3)),
            applied_steps_count = GREATEST(IFNULL(applied_steps_count, 0), 1),
            logs = CONCAT(
              COALESCE(logs, ''),
              '\n[auto-repair] Marked as applied after idempotent schema reconciliation.'
            )
      WHERE migration_name = ?
        AND finished_at IS NULL
        AND rolled_back_at IS NULL`,
    [TARGET_MIGRATION]
  );

  console.log(
    `[migration-repair] ${TARGET_MIGRATION} rows updated: ${result.affectedRows}`
  );
}

async function main() {
  if (!ENABLED) {
    console.log("[migration-repair] disabled");
    return;
  }

  const config = parseDatabaseUrl();
  const connection = await mysql.createConnection(config);

  try {
    await repairDeliveredAuctionMigration(connection);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("[migration-repair] failed", error);
  process.exit(1);
});
