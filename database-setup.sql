-- ============================================
-- ELLA RISES DATABASE SETUP - CLEAN POSTGRES VERSION
-- ============================================

-- Drop in correct dependency order
DROP TABLE IF EXISTS program_enrollments CASCADE;
DROP TABLE IF EXISTS programs CASCADE;
DROP TABLE IF EXISTS donations CASCADE;
DROP TABLE IF EXISTS milestone CASCADE;
DROP TABLE IF EXISTS registration CASCADE;
DROP TABLE IF EXISTS attendance CASCADE;
DROP TABLE IF EXISTS event_occurance CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS participants CASCADE;

DROP FUNCTION IF EXISTS update_participant_total_donations() CASCADE;

-- ============================================
-- CREATE TABLES
-- ============================================

-- Participants table
CREATE TABLE participants (
  id SERIAL PRIMARY KEY,
  participant_email VARCHAR(255) UNIQUE NOT NULL,
  participant_first_name VARCHAR(255) NOT NULL,
  participant_last_name VARCHAR(255),
  participant_dob DATE,
  participant_role VARCHAR(50) DEFAULT 'participant'
      CHECK (participant_role IN ('participant', 'admin')),
  participant_password VARCHAR(255) NOT NULL,
  participant_phone VARCHAR(20),
  participant_city VARCHAR(100),
  participant_state VARCHAR(2),
  participant_zip VARCHAR(10),
  participant_school_or_employer VARCHAR(255),
  participant_field_of_interest VARCHAR(100),
  total_donations DECIMAL(10,2) DEFAULT 0,
  login_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_participants_email ON participants(participant_email);
CREATE INDEX idx_participants_role ON participants(participant_role);

-- Events template table
CREATE TABLE events (
  event_name VARCHAR(255) PRIMARY KEY,
  event_type VARCHAR(100),
  event_description TEXT,
  event_recurrence_pattern VARCHAR(50),
  event_default_capacity INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Event occurance table
CREATE TABLE event_occurance (
  event_occurance_id SERIAL PRIMARY KEY,
  event_name VARCHAR(255) REFERENCES events(event_name) ON DELETE SET NULL,
  event_date_time_start TIMESTAMP NOT NULL,
  event_date_time_end TIMESTAMP,
  event_location VARCHAR(255),
  event_capacity INTEGER,
  event_registration_deadline TIMESTAMP,
  image_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_event_occurance_start_time 
  ON event_occurance(event_date_time_start);

-- Attendance table
CREATE TABLE attendance (
  attendance_id SERIAL PRIMARY KEY,
  registration_status VARCHAR(50),
  registration_attended_flag BOOLEAN
);

-- Registration table
CREATE TABLE registration (
  registration_id SERIAL PRIMARY KEY,
  participant_id INTEGER REFERENCES participants(id) ON DELETE CASCADE,
  event_occurance_id INTEGER REFERENCES event_occurance(event_occurance_id) ON DELETE CASCADE,
  attendance_id INTEGER REFERENCES attendance(attendance_id) ON DELETE SET NULL,
  registration_check_in_time TIMESTAMP,
  registration_created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  survey_satisfaction_score INTEGER CHECK (survey_satisfaction_score BETWEEN 1 AND 5),
  survey_usefulness_score INTEGER CHECK (survey_usefulness_score BETWEEN 1 AND 5),
  survey_instructor_score INTEGER CHECK (survey_instructor_score BETWEEN 1 AND 5),
  survey_recommendation_score INTEGER CHECK (survey_recommendation_score BETWEEN 1 AND 5),
  survey_overall_score NUMERIC(3,2),
  survey_nps_bucket VARCHAR(20),
  survey_comments TEXT,
  survey_submission_date TIMESTAMP,
  UNIQUE(participant_id, event_occurance_id)
);

CREATE INDEX idx_registration_participant ON registration(participant_id);
CREATE INDEX idx_registration_event ON registration(event_occurance_id);

-- Milestones
CREATE TABLE milestone (
  milestone_id SERIAL PRIMARY KEY,
  participant_id INTEGER REFERENCES participants(id) ON DELETE CASCADE,
  milestone_title VARCHAR(255) NOT NULL,
  milestone_category VARCHAR(100),
  milestone_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Donations
CREATE TABLE donations (
  donation_id SERIAL PRIMARY KEY,
  participant_id INTEGER REFERENCES participants(id) ON DELETE SET NULL,
  donation_date TIMESTAMP,
  donation_amount DECIMAL(10,2) NOT NULL,
  donation_number INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_donations_participant ON donations(participant_id);

-- Programs (retained)
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

CREATE TABLE program_enrollments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES participants(id) ON DELETE CASCADE,
  program_id INTEGER REFERENCES programs(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) DEFAULT 'active',
  UNIQUE(user_id, program_id)
);

-- ============================================
-- TRIGGER: Recalculate participant total donations
-- ============================================

CREATE OR REPLACE FUNCTION update_participant_total_donations()
RETURNS TRIGGER AS $$
DECLARE
  target_id INTEGER := COALESCE(NEW.participant_id, OLD.participant_id);
BEGIN
  UPDATE participants
  SET total_donations = (
    SELECT COALESCE(SUM(donation_amount), 0)
    FROM donations
    WHERE participant_id = target_id
  )
  WHERE id = target_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_total_donations
AFTER INSERT OR UPDATE OR DELETE ON donations
FOR EACH ROW
EXECUTE FUNCTION update_participant_total_donations();

-- ============================================
-- SEED DATA
-- ============================================

INSERT INTO participants (participant_email, participant_first_name, participant_last_name, participant_password, participant_role)
VALUES ('admin@ellarises.org', 'Admin', 'User', 'hashed_password', 'admin');

-- Sample participants
INSERT INTO participants (
  participant_email, participant_first_name, participant_last_name,
  participant_password, participant_role,
  participant_city, participant_state, participant_field_of_interest
) VALUES
('jane.doe@example.com', 'Jane', 'Doe', 'password', 'participant', 'Provo', 'UT', 'Education'),
('sarah.johnson@example.com', 'Sarah', 'Johnson', 'password', 'participant', 'Orem', 'UT', 'Business'),
('emily.chen@example.com', 'Emily', 'Chen', 'password', 'participant', 'Spanish Fork', 'UT', 'Technology'),
('maria.garcia@example.com', 'Maria', 'Garcia', 'password', 'participant', 'Springville', 'UT', 'Arts');

-- Events
INSERT INTO events (event_name, event_type, event_description, event_recurrence_pattern, event_default_capacity) VALUES
('Women in Leadership Workshop', 'Workshop', 'Leadership skills for women.', 'monthly', 50),
('Monthly Support Group', 'Meeting', 'Safe space to connect.', 'monthly', 20),
('Career Development Seminar', 'Seminar', 'Resume + networking help.', 'quarterly', 100);

-- Event occurrences
INSERT INTO event_occurance (event_name, event_date_time_start, event_date_time_end, event_location, event_capacity)
VALUES
('Women in Leadership Workshop', '2025-03-15 18:00', '2025-03-15 20:00', '123 Community Center, Provo', 50),
('Monthly Support Group', '2025-03-20 19:00', '2025-03-20 21:00', 'Ella Rises Community Room', 20),
('Career Development Seminar', '2025-04-05 17:30', '2025-04-05 19:30', 'Virtual Event (Zoom)', 100);

-- Registration examples
INSERT INTO registration (participant_id, event_occurance_id)
VALUES
(2, 1),
(3, 1);

-- Donations
INSERT INTO donations (participant_id, donation_amount, donation_date)
VALUES
(2, 50.00, '2025-01-15 10:00'),
(3, 25.00, NULL),
(NULL, 75.00, NULL);

-- Programs
INSERT INTO programs (title, description, age_range, schedule)
VALUES
('Ballet Folklorico', 'Mexican folk dance program.', 'Ages 11-18', 'Mondays at 7PM'),
('Summit + Educational Pathways', 'Day camp with art + STEM.', 'Ages 11-18', 'Summer');

INSERT INTO program_enrollments (user_id, program_id)
VALUES
(2, 1),
(3, 1);

-- ============================================
-- VERIFICATION
-- ============================================

SELECT 'participants', COUNT(*) FROM participants
UNION ALL SELECT 'events', COUNT(*) FROM events
UNION ALL SELECT 'event_occurance', COUNT(*) FROM event_occurance
UNION ALL SELECT 'registration', COUNT(*) FROM registration
UNION ALL SELECT 'donations', COUNT(*) FROM donations;