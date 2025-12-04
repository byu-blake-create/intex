#!/usr/bin/env node
/**
 * CSV Data Import Script with Password Hashing
 *
 * This script imports data from CSV files into the PostgreSQL database
 * and automatically hashes plaintext passwords using bcrypt.
 *
 * Features:
 * - Detects plaintext vs hashed passwords
 * - Hashes plaintext passwords before import
 * - Maps CSV columns to database schema
 * - Handles all CSV files in the Database Info directory
 * - Skips duplicates based on email
 *
 * Usage:
 *   node import-csv-data.js
 *   node import-csv-data.js --table=users
 *   node import-csv-data.js --dry-run
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const bcrypt = require('bcryptjs');
const knex = require('knex')({
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'ella_rises',
    port: process.env.DB_PORT || 5432,
  }
});

const SALT_ROUNDS = 10;
const DRY_RUN = process.argv.includes('--dry-run');
const CSV_DIR = path.join(__dirname, 'Database Info', 'Walgreens CSV');

// CSV file mappings
const CSV_FILES = {
  participants: {
    file: 'participants_table_v3.csv',
    table: 'users',
    mapping: {
      'ParticipantEmail': 'email',
      'ParticipantFirstName': 'first_name',
      'ParticipantLastName': 'last_name',
      'ParticipantDOB': 'date_of_birth',
      'ParticipantRole': 'role',
      'ParticipantPassword': 'password_hash',  // Will be hashed
      'ParticipantPhone': 'phone',
      'ParticipantCity': 'city',
      'ParticipantState': 'state',
      'ParticipantZip': 'zip',
      'ParticipantSchoolOrEmployer': 'school_or_employer',
      'ParticipantFieldOfInterest': 'field_of_interest',
      'TotalDonations': 'total_donations'
    },
    uniqueKey: 'email',
    hashPassword: true
  },
  // Add other CSV mappings here as needed
  /*
  events: {
    file: 'event_template_table.csv',
    table: 'events',
    mapping: { ... },
    uniqueKey: 'id'
  }
  */
};

/**
 * Check if a password is already bcrypt hashed
 */
function isBcryptHash(password) {
  if (!password || typeof password !== 'string') return false;
  return password.startsWith('$2a$') || password.startsWith('$2b$');
}

/**
 * Hash password if it's plaintext
 */
async function hashPasswordIfNeeded(password) {
  if (!password) return null;

  // If already hashed, return as-is
  if (isBcryptHash(password)) {
    console.log('  → Password already hashed, skipping');
    return password;
  }

  // Hash plaintext password
  console.log('  → Hashing plaintext password');
  return await bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Transform CSV row to database format
 */
async function transformRow(row, config) {
  const transformed = {};

  for (const [csvColumn, dbColumn] of Object.entries(config.mapping)) {
    let value = row[csvColumn];

    // Skip empty values
    if (value === '' || value === null || value === undefined) {
      continue;
    }

    // Special handling for password field
    if (config.hashPassword && dbColumn === 'password_hash') {
      value = await hashPasswordIfNeeded(value);
    }

    // Special handling for dates
    if (dbColumn === 'date_of_birth' && value) {
      // Convert to ISO format
      const date = new Date(value);
      if (!isNaN(date)) {
        value = date.toISOString().split('T')[0];
      }
    }

    // Special handling for numbers
    if (dbColumn === 'total_donations' && value) {
      value = parseFloat(value) || 0;
    }

    // Add name field (combination of first and last name)
    if (dbColumn === 'first_name') {
      const lastName = row['ParticipantLastName'] || '';
      transformed.name = `${value} ${lastName}`.trim();
    }

    transformed[dbColumn] = value;
  }

  return transformed;
}

/**
 * Import data from a single CSV file
 */
async function importCSV(name, config) {
  const filePath = path.join(CSV_DIR, config.file);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Importing: ${name}`);
  console.log(`File: ${config.file}`);
  console.log(`Table: ${config.table}`);
  console.log(`${'='.repeat(60)}\n`);

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    return { success: false, error: 'File not found' };
  }

  const rows = [];
  const errors = [];
  let rowNumber = 0;

  // Read CSV file (handle UTF-8 BOM)
  return new Promise((resolve) => {
    fs.createReadStream(filePath, { encoding: 'utf8' })
      .pipe(csv({ skipLines: 0, mapHeaders: ({ header }) => header.trim().replace(/^\uFEFF/, '') }))
      .on('data', (row) => {
        rowNumber++;
        rows.push({ rowNumber, data: row });
      })
      .on('end', async () => {
        console.log(`✅ Read ${rows.length} rows from CSV\n`);

        let imported = 0;
        let skipped = 0;
        let failed = 0;

        for (const { rowNumber, data } of rows) {
          try {
            // Transform row
            const transformed = await transformRow(data, config);

            // Skip if no unique key
            const uniqueValue = transformed[config.uniqueKey];
            if (!uniqueValue) {
              console.log(`⚠️  Row ${rowNumber}: Skipping (no ${config.uniqueKey})`);
              skipped++;
              continue;
            }

            // Check if already exists
            const existing = await knex(config.table)
              .where({ [config.uniqueKey]: uniqueValue })
              .first();

            if (existing) {
              console.log(`⚠️  Row ${rowNumber}: Skipping ${uniqueValue} (already exists)`);
              skipped++;
              continue;
            }

            // Insert into database
            if (DRY_RUN) {
              console.log(`🔍 [DRY RUN] Would insert:`, {
                [config.uniqueKey]: uniqueValue,
                ...Object.keys(transformed).slice(0, 3)
              });
              imported++;
            } else {
              await knex(config.table).insert(transformed);
              console.log(`✅ Row ${rowNumber}: Imported ${uniqueValue}`);
              imported++;
            }

          } catch (error) {
            console.error(`❌ Row ${rowNumber}: Error - ${error.message}`);
            errors.push({ rowNumber, error: error.message, data });
            failed++;
          }
        }

        console.log(`\n${'─'.repeat(60)}`);
        console.log(`Summary for ${name}:`);
        console.log(`  ✅ Imported: ${imported}`);
        console.log(`  ⚠️  Skipped:  ${skipped}`);
        console.log(`  ❌ Failed:   ${failed}`);
        console.log(`  📊 Total:    ${rows.length}`);
        console.log(`${'─'.repeat(60)}\n`);

        resolve({
          success: failed === 0,
          imported,
          skipped,
          failed,
          errors
        });
      });
  });
}

/**
 * Main execution
 */
async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('CSV DATA IMPORT WITH PASSWORD HASHING');
  console.log('='.repeat(60));

  if (DRY_RUN) {
    console.log('\n🔍 DRY RUN MODE - No data will be modified\n');
  }

  // Get table filter from command line
  const tableArg = process.argv.find(arg => arg.startsWith('--table='));
  const tableFilter = tableArg ? tableArg.split('=')[1] : null;

  try {
    // Test database connection
    await knex.raw('SELECT 1');
    console.log('✅ Database connected\n');

    // Import each CSV file
    const results = {};
    for (const [name, config] of Object.entries(CSV_FILES)) {
      if (tableFilter && name !== tableFilter) {
        console.log(`⏭️  Skipping ${name} (filtered)`);
        continue;
      }

      results[name] = await importCSV(name, config);
    }

    // Final summary
    console.log('\n' + '='.repeat(60));
    console.log('FINAL SUMMARY');
    console.log('='.repeat(60));

    let totalImported = 0;
    let totalSkipped = 0;
    let totalFailed = 0;

    for (const [name, result] of Object.entries(results)) {
      console.log(`\n${name}:`);
      console.log(`  Imported: ${result.imported}`);
      console.log(`  Skipped:  ${result.skipped}`);
      console.log(`  Failed:   ${result.failed}`);

      totalImported += result.imported;
      totalSkipped += result.skipped;
      totalFailed += result.failed;
    }

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`TOTAL:`);
    console.log(`  ✅ Imported: ${totalImported}`);
    console.log(`  ⚠️  Skipped:  ${totalSkipped}`);
    console.log(`  ❌ Failed:   ${totalFailed}`);
    console.log('='.repeat(60) + '\n');

    if (DRY_RUN) {
      console.log('🔍 This was a DRY RUN. Run without --dry-run to actually import.\n');
    }

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await knex.destroy();
  }
}

// Run if called directly
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { importCSV, hashPasswordIfNeeded, isBcryptHash };
