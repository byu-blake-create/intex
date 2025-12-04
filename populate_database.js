#!/usr/bin/env node
/**
 * Comprehensive CSV Data Import Script
 *
 * This script populates the PostgreSQL database from a set of CSV files,
 * handling schema mapping, data transformation, password hashing, and
 * foreign key relationships.
 *
 * Usage:
 *   node populate_database.js
 *   node populate_database.js --dry-run
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const bcrypt = require('bcryptjs');

// ============================================ 
// DATABASE CONNECTION (Knex)
// ============================================ 
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

// ============================================ 
// CONFIGURATION
// ============================================ 
const SALT_ROUNDS = 10;
const DRY_RUN = process.argv.includes('--dry-run');
const CSV_DIR = path.join(__dirname, 'Database Info', 'Walgreens CSV');

// A cache to store foreign key mappings (e.g., email -> id) to reduce DB lookups
const fkCache = {
  participants: {},
  events: {},
  event_occurances: {},
};

/**
 * Main import configuration.
 * The order of this array is important.
 * We import tables without dependencies first (participants, events).
 */
const IMPORT_CONFIGS = [
  {
    name: 'participants',
    file: 'participants_table_v3.csv',
    table: 'participants',
    uniqueKey: 'ParticipantEmail',
    mapping: {
      'ParticipantEmail': 'participant_email',
      'ParticipantFirstName': 'participant_first_name',
      'ParticipantLastName': 'participant_last_name',
      'ParticipantDOB': 'participant_dob',
      'ParticipantRole': 'participant_role',
      'ParticipantPassword': 'participant_password',
      'ParticipantPhone': 'participant_phone',
      'ParticipantCity': 'participant_city',
      'ParticipantState': 'participant_state',
      'ParticipantZip': 'participant_zip',
      'ParticipantSchoolOrEmployer': 'participant_school_or_employer',
      'ParticipantFieldOfInterest': 'participant_field_of_interest'
    },
    transform: async (row) => {
      if (row.participant_password) {
        row.participant_password = await hashPasswordIfNeeded(row.participant_password);
      }
      return row;
    }
  },
  {
    name: 'attendance',
    file: 'attendance_table.csv',
    table: 'attendance',
    uniqueKey: 'AttendanceID',
    mapping: {
      'AttendanceID': 'attendance_id',
      'RegistrationStatus': 'registration_status',
      'RegistrationAttendedFlag': 'registration_attended_flag'
    }
  },
  {
    name: 'event_templates',
    file: 'event_template_table.csv',
    table: 'events',
    uniqueKey: 'event_name',
    mapping: {
      'event_name': 'event_name',
      'event_type': 'event_type',
      'event_description': 'event_description',
      'event_recurrence_pattern': 'event_recurrence_pattern',
      'event_default_capacity': 'event_default_capacity'
    }
  },
  {
    name: 'event_occurances',
    file: 'event_occurance_table.csv',
    table: 'event_occurance',
    uniqueKey: 'event_occurrence_id',
    mapping: {
      'event_occurrence_id': 'event_occurance_id',
      'event_name': 'event_name',
      'event_date_time_start': 'event_date_time_start',
      'event_date_time_end': 'event_date_time_end',
      'event_location': 'event_location',
      'event_capacity': 'event_capacity',
      'event_registration_deadline': 'event_registration_deadline'
    }
  },
  {
    name: 'donations',
    file: 'donations_table.csv',
    table: 'donations',
    uniqueKey: 'DonationID',
    mapping: {
      'DonationID': 'donation_id',
      'ParticipantEmail': 'participant_id',
      'DonationDate': 'donation_date',
      'DonationAmount': 'donation_amount',
      'DonationNumber': 'donation_number'
    },
    transform: async (row) => {
      if (row.participant_id) {
        row.participant_id = await getParticipantId(row.participant_id);
      }
      return row;
    }
  },
  {
    name: 'milestones',
    file: 'milestones_table_v2.csv',
    table: 'milestone',
    uniqueKey: 'MilestoneID',
    mapping: {
      'MilestoneID': 'milestone_id',
      'ParticipantEmail': 'participant_id',
      'MilestoneTitle': 'milestone_title',
      'MilestoneCategory': 'milestone_category',
      'MilestoneDate': 'milestone_date'
    },
    transform: async (row) => {
      if (row.participant_id) {
        row.participant_id = await getParticipantId(row.participant_id);
      }
      return row;
    }
  },
];


// ============================================ 
// HELPER FUNCTIONS
// ============================================ 

/**
 * Check if a password is a bcrypt hash.
 */
function isBcryptHash(password) {
  return password && password.startsWith('$2a$');
}

/**
 * Hash a password if it's not already hashed.
 */
async function hashPasswordIfNeeded(password) {
  if (!password || isBcryptHash(password)) {
    return password;
  }
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Get participant ID from email, using a cache to avoid repeated lookups.
 */
async function getParticipantId(email) {
  if (fkCache.participants[email]) {
    return fkCache.participants[email];
  }
  const participant = await knex('participants').where({ participant_email: email }).first();
  if (participant) {
    fkCache.participants[email] = participant.id;
    return participant.id;
  }
  return null;
}

/**
 * Generic CSV processing function.
 */
async function processCSV(config) {
  const filePath = path.join(CSV_DIR, config.file);
  if (!fs.existsSync(filePath)) {
    console.error(`\n❌ File not found: ${filePath}`);
    return { name: config.name, imported: 0, skipped: 0, failed: 0 };
  }

  console.log(`\n${'='.repeat(40)}\nProcessing: ${config.name} (${config.file})\n${'='.repeat(40)}`);

  const rows = [];
  await new Promise(resolve => {
    fs.createReadStream(filePath, { encoding: 'utf8' })
      .pipe(csv({ mapHeaders: ({ header }) => header.trim().replace(/^\uFEFF/, '') }))
      .on('data', (row) => rows.push(row))
      .on('end', resolve);
  });

  let imported = 0, skipped = 0, failed = 0;

  for (const [i, row] of rows.entries()) {
    const rowNum = i + 1;
    try {
      const dbRow = {};
      for (const [csvKey, dbKey] of Object.entries(config.mapping)) {
        if (row[csvKey] !== undefined && row[csvKey] !== '') {
          dbRow[dbKey] = row[csvKey];
        }
      }

      // Apply custom transformations if they exist
      const transformedRow = config.transform ? await config.transform(dbRow) : dbRow;
      if (!transformedRow) {
        console.log(`- (Row ${rowNum}) Skipped: Transformer returned null.`);
        skipped++;
        continue;
      }

      // Check for existing records to prevent duplicates
      const csvUniqueKey = config.uniqueKey;
      const dbUniqueKey = config.mapping[csvUniqueKey];
      if (csvUniqueKey && dbUniqueKey) {
        const uniqueValue = row[csvUniqueKey];
        if (uniqueValue) {
          const existing = await knex(config.table).where({ [dbUniqueKey]: uniqueValue }).first();
          if (existing) {
            console.log(`- (Row ${rowNum}) Skipped: Record with ${dbUniqueKey} '${uniqueValue}' already exists.`);
            skipped++;
            continue;
          }
        }
      }

      if (DRY_RUN) {
        console.log(`- (Row ${rowNum}) [DRY RUN] Would insert into '${config.table}'`);
      } else {
        await knex(config.table).insert(transformedRow);
      }
      imported++;

    } catch (err) {
      console.error(`- (Row ${rowNum}) ❌ ERROR: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nSummary for ${config.name}: ✅ ${imported} imported, ⚠️ ${skipped} skipped, ❌ ${failed} failed.`);
  return { name: config.name, imported, skipped, failed };
}

// ============================================ 
/**
 * Import data from the complex registration_table.csv
 */
async function importRegistrations() {
  const config = {
    name: 'registrations',
    file: 'registration_table.csv',
    table: 'registration',
  };
  const filePath = path.join(CSV_DIR, config.file);
  if (!fs.existsSync(filePath)) {
    console.error(`\n❌ File not found: ${filePath}`);
    return { name: config.name, imported: 0, skipped: 0, failed: 0 };
  }

  console.log(`\n${'='.repeat(40)}\nProcessing: ${config.name} (${config.file})\n${'='.repeat(40)}`);

  const rows = [];
  await new Promise(resolve => {
    fs.createReadStream(filePath, { encoding: 'utf8' })
      .pipe(csv({ mapHeaders: ({ header }) => header.trim().replace(/^\uFEFF/, '') }))
      .on('data', (row) => rows.push(row))
      .on('end', resolve);
  });

  let imported = 0, skipped = 0, failed = 0;

  for (const [i, row] of rows.entries()) {
    const rowNum = i + 1;
    try {
      const participantId = await getParticipantId(row.ParticipantEmail);
      if (!participantId) {
        console.log(`- (Row ${rowNum}) Skipped: Participant with email '${row.ParticipantEmail}' not found.`);
        skipped++;
        continue;
      }
      
      const eventOccuranceId = row.EventOccurrenceID;

      // Check if registration already exists
      const existing = await knex('registration')
        .where({
          participant_id: participantId,
          event_occurance_id: eventOccuranceId
        })
        .first();

      if (existing) {
        console.log(`- (Row ${rowNum}) Skipped: Registration for participant ${participantId} and event ${eventOccuranceId} already exists.`);
        skipped++;
        continue;
      }

      const dbRow = {
        registration_id: row.RegistrationID,
        participant_id: participantId,
        event_occurance_id: eventOccuranceId,
        attendance_id: row.AttendanceID,
        registration_check_in_time: row.RegistrationCheckInTime || null,
        registration_created_at: row.RegistrationCreatedAt || new Date(),
        survey_satisfaction_score: row.SurveySatisfactionScore || null,
        survey_usefulness_score: row.SurveyUsefulnessScore || null,
        survey_instructor_score: row.SurveyInstructorScore || null,
        survey_recommendation_score: row.SurveyRecommendationScore || null,
        survey_overall_score: row.SurveyOverallScore || null,
        survey_nps_bucket: row.SurveyNPSBucket || null,
        survey_comments: row.SurveyComments || null,
        survey_submission_date: row.SurveySubmissionDate || null,
      };

      if (DRY_RUN) {
        console.log(`- (Row ${rowNum}) [DRY RUN] Would insert into 'registration'`);
      } else {
        await knex('registration').insert(dbRow);
      }
      imported++;

    } catch (err) {
      console.error(`- (Row ${rowNum}) ❌ ERROR: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nSummary for ${config.name}: ✅ ${imported} imported, ⚠️ ${skipped} skipped, ❌ ${failed} failed.`);
  return { name: config.name, imported, skipped, failed };
}


// ============================================
// MAIN EXECUTION
// ============================================

async function main() {
  console.log('='.repeat(60) + '\nStarting Database Population Script\n' + '='.repeat(60));

  if (DRY_RUN) {
    console.log('\n>> DRY RUN MODE ENABLED: No data will be written to the database.\n');
  }

  try {
    await knex.raw('SELECT 1');
    console.log('✅ Database connection successful.');

    // Populate the cache for participants and events
    console.log('Pre-loading foreign key caches...');
    const participants = await knex('participants').select('id', 'participant_email');
    for (const p of participants) {
      fkCache.participants[p.participant_email] = p.id;
    }
    console.log(`  - Cached ${Object.keys(fkCache.participants).length} participants.`);

    // Run imports in the configured order
    for (const config of IMPORT_CONFIGS) {
      await processCSV(config);
    }
    
    // Import the complex registration table
    await importRegistrations();

  } catch (err) {
    console.error(`\n❌ A fatal error occurred: ${err.message}`);
    console.error(err.stack);
  } finally {
    console.log('\nScript finished. Closing database connection.');
    await knex.destroy();
  }
}

main().catch(err => console.error(err));
