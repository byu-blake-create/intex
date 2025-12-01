Monday
Normalize Data
Create ERD
Create SQL Scripts
Create Local Database
Start on Node.js website
Have our elastic Beanstalk ready to deploy
Create personal AWS account
Tuesday
Have a working local website
Complete EDA
Start deployment to AWS
Start Deployment to RDS
Start Making Tableau charts
Wednesday
Finish Deployment to AWS
Finish Deployment to RDS
Finish Making Tableau charts
Thursday
Extra day for cleanup
presentation building
Presentation practice




✅ INTEX MASTER EXECUTION PLAN (BY DAY)
Fully aligned with the rubric + your planned schedule.

⭐ MONDAY — DATABASE + FOUNDATIONS DAY
(Your main goal: Finish all IS 402 deliverables + start IS 403 + prep for IS 404)
1. Normalize the Data (IS 402)
Create spreadsheet with these sheets exactly as the rubric requires:
Raw data
1NF
Primary Keys
Dependencies
2NF
3NF
3NF w/ IDs
→ Target: 20 points from rubric.
2. Build the ERD (IS 402)
Tables MUST include:
Users (manager/common)
Participants
Events
Surveys
Milestones
ParticipantMilestones (bridge table)
Donations
→ Include cardinality + optionality (20 points).
3. SQL Scripts (IS 402)
Create:
DROP TABLE script
CREATE TABLES script
INSERT sample data script
→ (20 points)
4. Local Database Setup (IS 402)
Choose PostgreSQL or MySQL
Build DB locally
Test CRUD queries
→ Needed for “app reads & updates info” (10 points)
5. Start Node.js Website (IS 403)
Build the skeleton:
/public landing page
/login route
/dashboard route
/users, /participants, /events, /milestones, /surveys, /donations routes
Install required packages: express, ejs, knex, pg/mysql2, express-session
→ This sets the foundation for all IS 403 rubric items.
6. AWS Setup for Deployment (IS 404)
Create personal AWS account
Set up IAM user
Install EB CLI
Create beginning Elastic Beanstalk app
→ Needed for 25 points (deployed web server) and future DNS/HTTPS work.
End-of-Monday Goal:
✔ All IS 402 deliverables 80–90% done
✔ Node.js skeleton started
✔ AWS environment ready to receive deployment

⭐ TUESDAY — WEBSITE + ANALYTICS DAY
(Main goal: Working local website + Python EDA + AWS/RDS setup started)
1. Working Local Website (IS 403)
Complete:
Login + session handling
Manager vs Common User roles
Navigation bar with all required links
CRUD pages fully functional:
Users
Participants
Events
Milestones
Surveys
Donations
Participant → Milestones assignment working
→ Hitting 70+ points of IS 403 rubric.
2. Complete EDA (IS 415 – Part 1)
Your Python file must include:
Dataset overview
Data cleaning
Univariate (≥ 4 variables)
Bivariate (≥ 4 relationships)
Markdown insights after each section
Looks professional
→ Worth 20 points.
3. Start Deployment to AWS (IS 404)
Deploy local site to Elastic Beanstalk
Fix environment variables
Ensure /teapot route returns 418
4. Start RDS Setup (IS 404)
Create RDS PostgreSQL/MySQL instance
Connect Node app to RDS
Move schema + test data to RDS
5. Begin Tableau / Dashboard Charts (IS 415 Part 3)
Charts must:
Be clear
Insightful
Include filters for event type + demographics
End-of-Tuesday Goal:
✔ Local website fully functional
✔ EDA complete
✔ AWS deployment started
✔ RDS in progress
✔ Tableau charts started

⭐ WEDNESDAY — DEPLOYMENT + DASHBOARD DAY
(Main goal: App fully deployed + dashboard finished + database live)
1. Finish AWS Deployment (IS 404)
EB environment stable
App loads over HTTPS
Custom DNS configured (is404.net subdomain)
Teapot page returning 418
→ Worth 75+ points.
2. Finish RDS Integration
All CRUD actions use RDS
Test every table (Users, Participants, Events, Surveys, Milestones, Donations)
3. Finish Tableau Dashboard (IS 415 Part 3)
Add all required KPIs
Add filters (event type + demographics)
Clean spacing / alignment / formatting
→ Worth 35 points.
4. Embed Dashboard in Website (IS 403 + IS 415)
Test that:
Only logged-in users can view dashboard
Loads correctly inside EJS
Responsive
End-of-Wednesday Goal:
✔ Complete deployment
✔ Complete dashboard
✔ Fully working, cloud-hosted website

⭐ THURSDAY — POLISH + PRESENTATION DAY
(Main goal: Build the presentation + record videos + finalize submission package)
1. Cleanup Day
Fix:
Page professionalism (LOTS of rubric points here!)
Navigation
CRUD search bars
Donation page formatting
Landing page messaging (4 points)
2. Build Presentation (IS 415)
Slide deck must:
Tell a story
Show insights from EDA
Include at least 2 strong charts
Show value of website + dashboard
End with clear recommendations
3. Practice Presentation
20-minute pitch + 5-minute Q&A
Key tone: “You should invest in this system.”
4. Prepare Deliverable Zip File
Include:
Slides
4 videos
Source code / GitHub
README with URL + login
Normalization spreadsheet (3NF steps)
ERD
SQL scripts
Preliminary AI feedback document
Dashboard links (Colab + Tableau)
End-of-Thursday Goal:
✔ Everything done except final upload
✔ Team confident presenting
