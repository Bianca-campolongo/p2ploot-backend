
const mysql = require('mysql2/promise');

async function main() {
    const connectionUrl = process.env.DATABASE_URL;
    if (!connectionUrl) {
        console.error('ERROR: DATABASE_URL environment variable is not set.');
        process.exit(1);
    }
    console.log('Connecting to database...');

    const connection = await mysql.createConnection(connectionUrl);

    try {
        console.log('Checking trust_votes table...');

        // Create table if not exists
        await connection.execute(`
      CREATE TABLE IF NOT EXISTS trust_votes (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        voter_id CHAR(36) NOT NULL,
        target_id CHAR(36) NOT NULL,
        type VARCHAR(20) NOT NULL,
        created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE KEY trust_votes_voter_id_target_id_key (voter_id, target_id),
        INDEX trust_votes_voter_id_idx (voter_id),
        INDEX trust_votes_target_id_idx (target_id),
        CONSTRAINT trust_votes_voter_id_fkey FOREIGN KEY (voter_id) REFERENCES profiles(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT trust_votes_target_id_fkey FOREIGN KEY (target_id) REFERENCES profiles(id) ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);

        console.log('✅ Table trust_votes ensured.');
    } catch (error) {
        console.error('Error creating table:', error);
    } finally {
        await connection.end();
    }
}

main();
