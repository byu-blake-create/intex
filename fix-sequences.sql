-- Fix PostgreSQL sequences after data import
-- Run this on your RDS database to reset all sequences

-- Fix participants table sequence
SELECT setval(
    pg_get_serial_sequence('participants', 'id'),
    COALESCE((SELECT MAX(id) FROM participants), 1),
    true
);

-- Fix donations table sequence
SELECT setval(
    pg_get_serial_sequence('donations', 'donation_id'),
    COALESCE((SELECT MAX(donation_id) FROM donations), 1),
    true
);

-- Fix milestone table sequence
SELECT setval(
    pg_get_serial_sequence('milestone', 'milestone_id'),
    COALESCE((SELECT MAX(milestone_id) FROM milestone), 1),
    true
);

-- Fix registration table sequence
SELECT setval(
    pg_get_serial_sequence('registration', 'registration_id'),
    COALESCE((SELECT MAX(registration_id) FROM registration), 1),
    true
);

-- Fix event_occurance table sequence
SELECT setval(
    pg_get_serial_sequence('event_occurance', 'event_occurance_id'),
    COALESCE((SELECT MAX(event_occurance_id) FROM event_occurance), 1),
    true
);

-- Verify sequences are now correct
SELECT
    'participants' as table_name,
    last_value as next_id
FROM participants_id_seq
UNION ALL
SELECT
    'donations',
    last_value
FROM donations_donation_id_seq
UNION ALL
SELECT
    'milestone',
    last_value
FROM milestone_milestone_id_seq
UNION ALL
SELECT
    'registration',
    last_value
FROM registration_registration_id_seq
UNION ALL
SELECT
    'event_occurance',
    last_value
FROM event_occurance_event_occurance_id_seq;
