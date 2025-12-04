-- This script resets the sequences for the tables that have auto-incrementing IDs.
-- Run this script on your database if you are getting "duplicate key" errors when creating new records.

SELECT 'Fixing sequence for participants table...';
SELECT setval(pg_get_serial_sequence('participants', 'id'), coalesce(max(id), 1)) FROM participants;

SELECT 'Fixing sequence for programs table...';
SELECT setval(pg_get_serial_sequence('programs', 'id'), coalesce(max(id), 1)) FROM programs;

SELECT 'Fixing sequence for program_enrollments table...';
SELECT setval(pg_get_serial_sequence('program_enrollments', 'id'), coalesce(max(id), 1)) FROM program_enrollments;

SELECT 'Done.';