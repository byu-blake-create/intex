-- ============================================
-- ELLA RISES DATABASE SETUP - NEW HYBRID SCHEMA
-- ============================================

-- Drop existing tables (careful in production!)
DROP TABLE IF EXISTS program_enrollments CASCADE;
DROP TABLE IF EXISTS programs CASCADE;
DROP TABLE IF EXISTS registration CASCADE;
DROP TABLE IF EXISTS attendance CASCADE;
DROP TABLE IF EXISTS event_occurance CASCADE;
DROP TABLE IF EXISTS events CASCADE; -- This is the new event template table
DROP TABLE IF EXISTS milestone CASCADE;
DROP TABLE IF EXISTS donations CASCADE;
DROP TABLE IF EXISTS participants CASCADE;

-- Drop existing functions
DROP FUNCTION IF EXISTS update_user_total_donations() CASCADE;

-- ============================================
-- CREATE TABLES
-- ============================================

-- participants table (replaces old users table)
CREATE TABLE participants (
  id SERIAL PRIMARY KEY, -- Added for FK consistency with app
  participant_email VARCHAR(255) UNIQUE NOT NULL,
  participant_first_name VARCHAR(255) NOT NULL,
  participant_last_name VARCHAR(255),
  participant_dob DATE,
  participant_role VARCHAR(50) DEFAULT 'participant' CHECK (participant_role IN ('participant', 'admin')),
  participant_password VARCHAR(255) NOT NULL, -- Maps to password_hash
  participant_phone VARCHAR(20),
  participant_city VARCHAR(100),
  participant_state VARCHAR(2),
  participant_zip VARCHAR(10),
  participant_school_or_employer VARCHAR(255),
  participant_field_of_interest VARCHAR(100),
  total_donations DECIMAL(10, 2) DEFAULT 0,
  login_count INTEGER DEFAULT 0, -- Added for app functionality
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP -- Added for app functionality
);
CREATE INDEX idx_participants_email ON participants(participant_email);
CREATE INDEX idx_participants_role ON participants(participant_role);

-- events table (new event template table)
CREATE TABLE events (
  event_name VARCHAR(255) PRIMARY KEY, -- Renamed from 'id', now string PK
  event_type VARCHAR(100),
  event_description TEXT,
  event_recurrence_pattern VARCHAR(50),
  event_default_capacity INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP -- Added for consistency
);

-- event_occurance table (replaces old events table)
CREATE TABLE event_occurance (
  event_occurance_id SERIAL PRIMARY KEY, -- Renamed from 'id'
  event_name VARCHAR(255) REFERENCES events(event_name) ON DELETE SET NULL, -- FK to new events table
  event_date_time_start TIMESTAMP NOT NULL, -- Renamed from 'start_time'
  event_date_time_end TIMESTAMP, -- Renamed from 'end_time'
  event_location VARCHAR(255),
  event_capacity INTEGER,
  event_registration_deadline TIMESTAMP,
  image_url VARCHAR(500), -- Added
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP -- Added
);
CREATE INDEX idx_event_occurance_start_time ON event_occurance(event_date_time_start);

-- attendance table (new)
CREATE TABLE attendance (
  attendance_id SERIAL PRIMARY KEY,
  registration_status VARCHAR(50),
  registration_attended_flag BOOLEAN
);

-- registration table (replaces old event_registrations and surveys tables)
CREATE TABLE registration (
  registration_id SERIAL PRIMARY KEY,
  participant_id INTEGER REFERENCES participants(id) ON DELETE CASCADE,
  event_occurance_id INTEGER REFERENCES event_occurance(event_occurance_id) ON DELETE CASCADE,
  attendance_id INTEGER REFERENCES attendance(attendance_id) ON DELETE SET NULL,
  registration_check_in_time TIMESTAMP,
  registration_created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Replaces created_at for event_registrations
  survey_satisfaction_score INTEGER CHECK (survey_satisfaction_score >= 1 AND survey_satisfaction_score <= 5),
  survey_usefulness_score INTEGER CHECK (survey_usefulness_score >= 1 AND survey_usefulness_score <= 5),
  survey_instructor_score INTEGER CHECK (survey_instructor_score >= 1 AND survey_instructor_score <= 5),
  survey_recommendation_score INTEGER CHECK (survey_recommendation_score >= 1 AND survey_recommendation_score <= 5),
  survey_overall_score NUMERIC(3,2),
  survey_nps_bucket VARCHAR(20), -- No CHECK constraint here as it's a calculated value, but can be added.
  survey_comments TEXT,
  survey_submission_date TIMESTAMP,
  UNIQUE(participant_id, event_occurance_id)
);
CREATE INDEX idx_registration_participant ON registration(participant_id);
CREATE INDEX idx_registration_event_occurance ON registration(event_occurance_id);

-- milestone table (replaces old milestones and participant_milestones)
CREATE TABLE milestone (
  milestone_id SERIAL PRIMARY KEY,
  participant_id INTEGER REFERENCES participants(id) ON DELETE CASCADE,
  milestone_title VARCHAR(255) NOT NULL,
  milestone_category VARCHAR(100),
  milestone_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- donations table
CREATE TABLE donations (
  donation_id SERIAL PRIMARY KEY,
  participant_id INTEGER REFERENCES participants(id) ON DELETE SET NULL, -- Renamed from user_id
  donation_date TIMESTAMP,
  donation_amount DECIMAL(10, 2) NOT NULL, -- Renamed from 'amount'
  donation_number INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP -- Added
);
CREATE INDEX idx_donations_participant ON donations(participant_id);

-- programs table (retained from old schema)
CREATE TABLE programs (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  age_range VARCHAR(100),
  schedule VARCHAR(255),
  fee DECIMAL(10, 2),
  additional_info TEXT,
  image_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- program_enrollments table (retained from old schema, FK updated)
CREATE TABLE program_enrollments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES participants(id) ON DELETE CASCADE, -- FK now to participants.id
  program_id INTEGER REFERENCES programs(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) DEFAULT 'active',
  UNIQUE(user_id, program_id)
);

-- ============================================
-- CREATE TRIGGER FUNCTIONS
-- ============================================

-- Trigger function to update total_donations in participants table
CREATE OR REPLACE FUNCTION update_participant_total_donations()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.participant_id IS NOT NULL THEN
    UPDATE participants
    SET total_donations = (
      SELECT COALESCE(SUM(donation_amount), 0)
      FROM donations
      WHERE participant_id = NEW.participant_id
    )
    WHERE id = NEW.participant_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on donations table
CREATE TRIGGER trigger_update_total_donations
AFTER INSERT OR UPDATE OR DELETE ON donations
FOR EACH ROW
EXECUTE FUNCTION update_participant_total_donations();

-- ============================================
-- INSERT INITIAL DATA
-- ============================================

-- Create admin user
-- Email: admin@ellarises.org
-- Password: admin123
INSERT INTO participants (participant_email, participant_first_name, participant_last_name, participant_password, participant_role) VALUES
('admin@ellarises.org', 'Admin', 'User', '$2a$10$dCwAFOvD0JYo3i/ztF2dxOxltLa.u6l8mYBx2b2jHmeeBEH3q8jGS', 'admin');

-- Create sample participant users
-- Password: participant123
INSERT INTO participants (participant_email, participant_first_name, participant_last_name, participant_password, participant_role, participant_city, participant_state, participant_field_of_interest) VALUES
('jane.doe@example.com', 'Jane', 'Doe', '$2a$10$TbsWcoitH0zrzBW1k67xM.7i3VQRLEHPiioDbfBIORwheLA.SptDe', 'participant', 'Provo', 'UT', 'Education'),
('sarah.johnson@example.com', 'Sarah', 'Johnson', '$2a$10$TbsWcoitH0zrzBW1k67xM.7i3VQRLEHPiioDbfBIORwheLA.SptDe', 'participant', 'Orem', 'UT', 'Business'),
('emily.chen@example.com', 'Emily', 'Chen', '$2a$10$TbsWcoitH0zrzBW1k67xM.7i3VQRLEHPiioDbfBIORwheLA.SptDe', 'participant', 'Spanish Fork', 'UT', 'Technology'),
('maria.garcia@example.com', 'Maria', 'Garcia', '$2a$10$TbsWcoitH0zrzBW1k67xM.7i3VQRLEHPiioDbfBIORwheLA.SptDe', 'participant', 'Springville', 'UT', 'Arts');

-- Insert milestone categories (now direct milestones)
INSERT INTO milestone (participant_id, milestone_title, milestone_category) VALUES
(1, 'Apprenticeship', 'Apprenticeship'), -- Admin user, if needed
(1, 'Bachelor''s Degree', 'Bachelor''s Degree'),
(2, 'Middle School Diploma', 'Education'),
(2, 'High School Diploma', 'Education');


-- Add sample event templates (new events table)
INSERT INTO events (event_name, event_type, event_description, event_recurrence_pattern, event_default_capacity) VALUES
('Women in Leadership Workshop', 'Workshop', 'Empowering workshop on leadership skills.', 'monthly', 50),
('Monthly Support Group', 'Meeting', 'A safe space to connect and share experiences.', 'monthly', 20),
('Career Development Seminar', 'Seminar', 'Career opportunities, resume building, networking.', 'quarterly', 100),
('Self-Care & Wellness Workshop', 'Workshop', 'Techniques for stress management and mindfulness.', 'biannual', 30),
('Financial Literacy for Women', 'Seminar', 'Budgeting, investing, financial planning.', 'quarterly', 40),
('Networking Mixer', 'Social', 'Connect with other women professionals.', 'monthly', 60);

-- Add sample event occurrences (new event_occurance table)
-- Assuming event_name 'Women in Leadership Workshop' exists in 'events'
INSERT INTO event_occurance (event_name, event_date_time_start, event_date_time_end, event_location, event_capacity) VALUES
('Women in Leadership Workshop', '2025-03-15 18:00:00', '2025-03-15 20:00:00', '123 Community Center, Provo', 50),
('Monthly Support Group', '2025-03-20 19:00:00', '2025-03-20 21:00:00', 'Ella Rises Community Room', 20),
('Career Development Seminar', '2025-04-05 17:30:00', '2025-04-05 19:30:00', 'Virtual Event (Zoom)', 100);


-- Add sample registrations (replaces event_registrations and some survey data)
-- Assuming participant_id 2-5 are Jane Doe, Sarah Johnson, Emily Chen, Maria Garcia
-- Assuming event_occurance_id 1-3 correspond to the sample event_occurances above
INSERT INTO registration (participant_id, event_occurance_id, registration_created_at) VALUES
(2, 1, CURRENT_TIMESTAMP - INTERVAL '5 days'), -- Jane Doe for Women in Leadership
(3, 1, CURRENT_TIMESTAMP - INTERVAL '4 days'); -- Sarah Johnson for Women in Leadership

-- Add some with survey data
INSERT INTO registration (participant_id, event_occurance_id, registration_created_at, survey_satisfaction_score, survey_usefulness_score, survey_instructor_score, survey_recommendation_score, survey_overall_score, survey_nps_bucket, survey_comments, survey_submission_date) VALUES
(2, 2, CURRENT_TIMESTAMP - INTERVAL '3 days', 5, 4, 5, 5, 4.75, 'Promoter', 'Great support group, very helpful!', CURRENT_TIMESTAMP - INTERVAL '2 days'),
(4, 3, CURRENT_TIMESTAMP - INTERVAL '2 days', 4, 4, 3, 4, 3.75, 'Passive', 'Informative, but could be more interactive.', CURRENT_TIMESTAMP - INTERVAL '1 day');


-- Add sample donations
INSERT INTO donations (participant_id, donation_amount, donation_date) VALUES
(2, 50.00, '2025-01-15 10:00:00'),
(3, 25.00, NULL),
(NULL, 75.00, NULL); -- Anonymous donation

-- Add sample programs (retained old schema)
INSERT INTO programs (title, description, age_range, schedule, fee, additional_info) VALUES
('Ballet Folklorico',
 'Experience the vibrant culture and traditions of Mexican folk dance. Learn authentic choreography, develop performance skills, and connect with your heritage through movement and music.',
 'Girls ages 11-18 years old',
 'Mondays at 7:00 PM',
 NULL,
 'Auditions for 2026 begin in May. No prior dance experience required - just bring your enthusiasm and willingness to learn!'),
('Summit + Educational Pathways',
 'Day camp packed with activities to give a glimpse of the Ella Rises Experience: art, STEM, and a focus on education! Conclude the day camp with a tour of a local university or technical college.',
 'Girls ages 11-18 years old',
 'Summer day camp - dates announced in spring',
 NULL,
 'This immersive day experience combines hands-on learning with college exploration. Limited spots available - register early!');

-- Enroll some participants in programs
INSERT INTO program_enrollments (user_id, program_id, enrolled_at, status) VALUES
(2, 1, CURRENT_TIMESTAMP - INTERVAL '90 days', 'active'),
(3, 1, CURRENT_TIMESTAMP - INTERVAL '85 days', 'active');

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

SELECT 'participants' as table_name, COUNT(*) as count FROM participants
UNION ALL
SELECT 'events', COUNT(*) FROM events
UNION ALL
SELECT 'event_occurance', COUNT(*) FROM event_occurance
UNION ALL
SELECT 'attendance', COUNT(*) FROM attendance
UNION ALL
SELECT 'registration', COUNT(*) FROM registration
UNION ALL
SELECT 'milestone', COUNT(*) FROM milestone
UNION ALL
SELECT 'donations', COUNT(*) FROM donations
UNION ALL
SELECT 'programs', COUNT(*) FROM programs
UNION ALL
SELECT 'program_enrollments', COUNT(*) FROM program_enrollments;

-- ============================================
-- SUCCESS MESSAGE
-- ============================================
SELECT '✓ Database setup complete with new hybrid schema! Ready for testing.' as message;
SELECT 'Admin Login: admin@ellarises.org / admin123' as credentials;
SELECT 'Sample Participants: participant123 (password for all sample participants)' as info;
