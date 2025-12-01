// ============================================
// ELLA RISES WEB APPLICATION
// ============================================
// A full-stack Node.js/Express application for Ella Rises organization
// Built with: Express, EJS, Knex, PostgreSQL, express-session, bcrypt

// Load environment variables
require('dotenv').config();

// ============================================
// DEPENDENCIES
// ============================================
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');

// ============================================
// KNEX DATABASE SETUP
// ============================================
// Configure Knex to connect to PostgreSQL
// Connection details come from environment variables
const knex = require('knex')({
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  },
});

// Expected database schema (for reference):
//
// users table:
//   - id (primary key)
//   - name (string)
//   - email (string, unique)
//   - password_hash (string)
//   - role (string: 'user' or 'admin')
//   - login_count (integer, default 0)
//
// events table:
//   - id (primary key)
//   - title (string)
//   - description (text)
//   - date (timestamp)
//   - location (string)
//   - capacity (integer)
//
// event_registrations table:
//   - id (primary key)
//   - user_id (foreign key to users)
//   - event_id (foreign key to events)
//   - created_at (timestamp)
//
// surveys table:
//   - id (primary key)
//   - user_id (foreign key)
//   - event_id (foreign key)
//   - rating (integer)
//   - feedback (text)
//   - created_at (timestamp)
//
// milestones table:
//   - id (primary key)
//   - title (string)
//   - description (text)
//
// participant_milestones table:
//   - id (primary key)
//   - user_id (foreign key)
//   - milestone_id (foreign key)
//   - achieved_at (timestamp)
//
// donations table:
//   - id (primary key)
//   - user_id (foreign key, nullable for anonymous donations)
//   - amount (decimal)
//   - created_at (timestamp)

// ============================================
// EXPRESS APP SETUP
// ============================================
const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// MIDDLEWARE CONFIGURATION
// ============================================

// Parse URL-encoded bodies (from forms)
app.use(express.urlencoded({ extended: true }));

// Parse JSON bodies
app.use(express.json());

// Serve static files from /public directory
app.use(express.static(path.join(__dirname, 'public')));

// Set EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Session configuration for user authentication
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'ella-rises-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // Set to true if using HTTPS
      maxAge: 1000 * 60 * 60 * 24, // 24 hours
    },
  })
);

// Make user data available in all templates
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.isLoggedIn = !!req.session.user;
  res.locals.isAdmin = req.session.user && req.session.user.role === 'admin';
  next();
});

// ============================================
// AUTHENTICATION MIDDLEWARE
// ============================================

// Middleware to protect routes - user must be logged in
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
}

// Middleware to protect admin-only routes
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).send('Access denied. Admin privileges required.');
  }
  next();
}

// ============================================
// PUBLIC ROUTES
// ============================================

// Landing page - Public facing, styled like ellarises.org
app.get('/', (req, res) => {
  res.render('index', {
    title: 'Home - Ella Rises',
  });
});

// ============================================
// AUTHENTICATION ROUTES
// ============================================

// Show login page
app.get('/login', (req, res) => {
  res.render('login', {
    title: 'Login - Ella Rises',
    error: null,
  });
});

// Handle login form submission
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    // Find user by email
    const user = await knex('users').where({ email }).first();

    if (!user) {
      return res.render('login', {
        title: 'Login - Ella Rises',
        error: 'Invalid email or password',
      });
    }

    // Compare password with hashed password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.render('login', {
        title: 'Login - Ella Rises',
        error: 'Invalid email or password',
      });
    }

    // Increment login count
    await knex('users')
      .where({ id: user.id })
      .increment('login_count', 1);

    // Store user in session (don't store password_hash)
    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    // Redirect based on role
    if (user.role === 'admin') {
      res.redirect('/admin/dashboard');
    } else {
      res.redirect('/user/dashboard');
    }
  } catch (error) {
    console.error('Login error:', error);
    res.render('login', {
      title: 'Login - Ella Rises',
      error: 'An error occurred. Please try again.',
    });
  }
});

// Show signup page
app.get('/signup', (req, res) => {
  res.render('signup', {
    title: 'Sign Up - Ella Rises',
    error: null,
  });
});

// Handle signup form submission
app.post('/signup', async (req, res) => {
  const { name, email, password, confirmPassword } = req.body;

  try {
    // Validate passwords match
    if (password !== confirmPassword) {
      return res.render('signup', {
        title: 'Sign Up - Ella Rises',
        error: 'Passwords do not match',
      });
    }

    // Check if user already exists
    const existingUser = await knex('users').where({ email }).first();

    if (existingUser) {
      return res.render('signup', {
        title: 'Sign Up - Ella Rises',
        error: 'An account with this email already exists',
      });
    }

    // Hash password
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // Insert new user (default role is 'user')
    const [newUser] = await knex('users')
      .insert({
        name,
        email,
        password_hash,
        role: 'user',
        login_count: 0,
      })
      .returning('*');

    // Log the user in immediately
    req.session.user = {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
    };

    res.redirect('/user/dashboard');
  } catch (error) {
    console.error('Signup error:', error);
    res.render('signup', {
      title: 'Sign Up - Ella Rises',
      error: 'An error occurred. Please try again.',
    });
  }
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.redirect('/');
  });
});

// ============================================
// EVENTS ROUTES (Public + User)
// ============================================

// Events list page - shows all upcoming events
// This page is publicly accessible (no login required to view)
app.get('/events', async (req, res) => {
  try {
    // Get all events from database, ordered by date
    const events = await knex('events')
      .select('*')
      .orderBy('date', 'asc');

    res.render('events/index', {
      title: 'Events - Ella Rises',
      events,
    });
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).send('Error loading events');
  }
});

// Event detail page - shows details for a specific event
// Public viewing, but sign-up requires login
app.get('/events/:eventId', async (req, res) => {
  const { eventId } = req.params;

  try {
    // Get the specific event
    const event = await knex('events')
      .where({ id: eventId })
      .first();

    if (!event) {
      return res.status(404).send('Event not found');
    }

    // Check if current user is already registered (if logged in)
    let isRegistered = false;
    if (req.session.user) {
      const registration = await knex('event_registrations')
        .where({
          user_id: req.session.user.id,
          event_id: eventId,
        })
        .first();

      isRegistered = !!registration;
    }

    res.render('events/detail', {
      title: `${event.title} - Ella Rises`,
      event,
      isRegistered,
    });
  } catch (error) {
    console.error('Error fetching event:', error);
    res.status(500).send('Error loading event');
  }
});

// Event sign-up - user registers for an event
// Requires login
app.post('/events/:eventId/signup', requireLogin, async (req, res) => {
  const { eventId } = req.params;
  const userId = req.session.user.id;

  try {
    // Check if already registered
    const existing = await knex('event_registrations')
      .where({
        user_id: userId,
        event_id: eventId,
      })
      .first();

    if (existing) {
      return res.redirect(`/events/${eventId}?message=already_registered`);
    }

    // Insert registration
    await knex('event_registrations').insert({
      user_id: userId,
      event_id: eventId,
      created_at: new Date(),
    });

    res.redirect(`/events/${eventId}?message=signup_success`);
  } catch (error) {
    console.error('Error signing up for event:', error);
    res.redirect(`/events/${eventId}?message=error`);
  }
});

// ============================================
// USER ROUTES (Normal Users)
// ============================================

// User dashboard
app.get('/user/dashboard', requireLogin, async (req, res) => {
  try {
    // Get user's registered events
    const registeredEvents = await knex('event_registrations')
      .join('events', 'event_registrations.event_id', 'events.id')
      .where('event_registrations.user_id', req.session.user.id)
      .select('events.*', 'event_registrations.created_at as registered_at')
      .orderBy('events.date', 'asc');

    // Get user's milestones
    const userMilestones = await knex('participant_milestones')
      .join('milestones', 'participant_milestones.milestone_id', 'milestones.id')
      .where('participant_milestones.user_id', req.session.user.id)
      .select('milestones.*', 'participant_milestones.achieved_at')
      .orderBy('participant_milestones.achieved_at', 'desc');

    res.render('user/dashboard', {
      title: 'My Rise - Ella Rises',
      registeredEvents,
      userMilestones,
    });
  } catch (error) {
    console.error('Error loading user dashboard:', error);
    res.status(500).send('Error loading dashboard');
  }
});

// User's events page
app.get('/user/events', requireLogin, async (req, res) => {
  try {
    const registeredEvents = await knex('event_registrations')
      .join('events', 'event_registrations.event_id', 'events.id')
      .where('event_registrations.user_id', req.session.user.id)
      .select('events.*', 'event_registrations.created_at as registered_at')
      .orderBy('events.date', 'asc');

    res.render('user/events', {
      title: 'My Events - Ella Rises',
      events: registeredEvents,
    });
  } catch (error) {
    console.error('Error loading user events:', error);
    res.status(500).send('Error loading events');
  }
});

// User's milestones page
app.get('/user/milestones', requireLogin, async (req, res) => {
  try {
    const userMilestones = await knex('participant_milestones')
      .join('milestones', 'participant_milestones.milestone_id', 'milestones.id')
      .where('participant_milestones.user_id', req.session.user.id)
      .select('milestones.*', 'participant_milestones.custom_title', 'participant_milestones.achieved_at', 'participant_milestones.id as user_milestone_id')
      .orderBy('participant_milestones.achieved_at', 'desc');

    // Get all milestone categories for the add form
    const milestoneCategories = await knex('milestones')
      .select('*')
      .orderBy('id', 'asc');

    res.render('user/milestones', {
      title: 'My Milestones - Ella Rises',
      milestones: userMilestones,
      categories: milestoneCategories,
    });
  } catch (error) {
    console.error('Error loading milestones:', error);
    res.status(500).send('Error loading milestones');
  }
});

// Add milestone - POST route
app.post('/user/milestones', requireLogin, async (req, res) => {
  const { milestone_id, custom_title } = req.body;

  try {
    await knex('participant_milestones').insert({
      user_id: req.session.user.id,
      milestone_id: parseInt(milestone_id),
      custom_title: custom_title,
      achieved_at: new Date(),
    });

    res.redirect('/user/milestones?success=true');
  } catch (error) {
    console.error('Error adding milestone:', error);
    res.redirect('/user/milestones?error=true');
  }
});

// Survey page - show form to submit post-event survey
app.get('/user/survey', requireLogin, async (req, res) => {
  try {
    // Get events the user has attended
    const attendedEvents = await knex('event_registrations')
      .join('events', 'event_registrations.event_id', 'events.id')
      .where('event_registrations.user_id', req.session.user.id)
      .select('events.*');

    res.render('user/survey', {
      title: 'Submit Survey - Ella Rises',
      events: attendedEvents,
      success: null,
      error: null,
    });
  } catch (error) {
    console.error('Error loading survey page:', error);
    res.status(500).send('Error loading survey page');
  }
});

// Handle survey submission
app.post('/user/survey', requireLogin, async (req, res) => {
  const { event_id, satisfaction_rating, usefulness_rating, instructor_rating, recommendation_rating, additional_feedback } = req.body;

  try {
    // Calculate overall score as average of all 4 ratings
    const sat = parseInt(satisfaction_rating);
    const use = parseInt(usefulness_rating);
    const inst = parseInt(instructor_rating);
    const rec = parseInt(recommendation_rating);
    const overall_score = (sat + use + inst + rec) / 4;

    await knex('surveys').insert({
      user_id: req.session.user.id,
      event_id: parseInt(event_id),
      satisfaction_rating: sat,
      usefulness_rating: use,
      instructor_rating: inst,
      recommendation_rating: rec,
      overall_score: overall_score,
      additional_feedback,
      created_at: new Date(),
    });

    // Get events again to re-render the form
    const attendedEvents = await knex('event_registrations')
      .join('events', 'event_registrations.event_id', 'events.id')
      .where('event_registrations.user_id', req.session.user.id)
      .select('events.*');

    res.render('user/survey', {
      title: 'Submit Survey - Ella Rises',
      events: attendedEvents,
      success: 'Thank you for your feedback!',
      error: null,
    });
  } catch (error) {
    console.error('Error submitting survey:', error);

    const attendedEvents = await knex('event_registrations')
      .join('events', 'event_registrations.event_id', 'events.id')
      .where('event_registrations.user_id', req.session.user.id)
      .select('events.*');

    res.render('user/survey', {
      title: 'Submit Survey - Ella Rises',
      events: attendedEvents,
      success: null,
      error: 'Error submitting survey. Please try again.',
    });
  }
});

// ============================================
// ADMIN ROUTES
// ============================================

// Admin dashboard
app.get('/admin/dashboard', requireAdmin, (req, res) => {
  res.render('admin/dashboard', {
    title: 'Admin Dashboard - Ella Rises',
  });
});

// ============================================
// ADMIN - PARTICIPANTS MANAGEMENT
// ============================================

// Admin participants list - shows all users with search/filter
app.get('/admin/participants', requireAdmin, async (req, res) => {
  try {
    const { search } = req.query;

    let query = knex('users').select('*');

    // Apply search filter if provided
    if (search) {
      query = query.where(function () {
        this.where('name', 'ilike', `%${search}%`).orWhere('email', 'ilike', `%${search}%`);
      });
    }

    const users = await query.orderBy('name', 'asc');

    res.render('admin/participants', {
      title: 'Participants - Admin - Ella Rises',
      users,
      search: search || '',
    });
  } catch (error) {
    console.error('Error loading participants:', error);
    res.status(500).send('Error loading participants');
  }
});

// Admin participant detail - shows individual user details, their events, and password change form
app.get('/admin/participants/:userId', requireAdmin, async (req, res) => {
  const { userId } = req.params;

  try {
    // Get user details
    const user = await knex('users').where({ id: userId }).first();

    if (!user) {
      return res.status(404).send('User not found');
    }

    // Get events this user has signed up for
    const userEvents = await knex('event_registrations')
      .join('events', 'event_registrations.event_id', 'events.id')
      .where('event_registrations.user_id', userId)
      .select('events.*', 'event_registrations.created_at as registered_at')
      .orderBy('events.date', 'asc');

    res.render('admin/participantDetail', {
      title: `${user.name} - Participants - Admin - Ella Rises`,
      participant: user,
      userEvents,
      success: req.query.success || null,
      error: req.query.error || null,
    });
  } catch (error) {
    console.error('Error loading participant details:', error);
    res.status(500).send('Error loading participant details');
  }
});

// Admin change user password
app.post('/admin/participants/:userId/change-password', requireAdmin, async (req, res) => {
  const { userId } = req.params;
  const { newPassword, confirmPassword } = req.body;

  try {
    // Validate passwords match
    if (newPassword !== confirmPassword) {
      return res.redirect(`/admin/participants/${userId}?error=Passwords do not match`);
    }

    // Hash new password
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(newPassword, saltRounds);

    // Update user's password
    await knex('users').where({ id: userId }).update({ password_hash });

    res.redirect(`/admin/participants/${userId}?success=Password updated successfully`);
  } catch (error) {
    console.error('Error changing password:', error);
    res.redirect(`/admin/participants/${userId}?error=Error updating password`);
  }
});

// ============================================
// ADMIN - EVENTS MANAGEMENT
// ============================================

// Admin events page - view/manage all events
app.get('/admin/events', requireAdmin, async (req, res) => {
  try {
    const events = await knex('events').select('*').orderBy('date', 'asc');

    res.render('admin/events', {
      title: 'Events - Admin - Ella Rises',
      events,
    });
  } catch (error) {
    console.error('Error loading events:', error);
    res.status(500).send('Error loading events');
  }
});

// ============================================
// ADMIN - SURVEYS MANAGEMENT
// ============================================

// Admin surveys page - view all surveys
app.get('/admin/surveys', requireAdmin, async (req, res) => {
  try {
    const { search_event, search_participant, sort_by, sort_order, filter_nps } = req.query;

    let query = knex('surveys')
      .join('users', 'surveys.user_id', 'users.id')
      .join('events', 'surveys.event_id', 'events.id')
      .select('surveys.*', 'users.name as user_name', 'events.title as event_title');

    // Apply event search filter
    if (search_event) {
      query = query.where('events.title', 'ilike', `%${search_event}%`);
    }

    // Apply participant search filter
    if (search_participant) {
      query = query.where('users.name', 'ilike', `%${search_participant}%`);
    }

    // Apply NPS filter
    if (filter_nps) {
      if (filter_nps === 'Promoter') {
        query = query.where('surveys.recommendation_rating', '=', 5);
      } else if (filter_nps === 'Passive') {
        query = query.where('surveys.recommendation_rating', '=', 4);
      } else if (filter_nps === 'Detractor') {
        query = query.where('surveys.recommendation_rating', '<=', 3);
      }
    }

    // Apply sorting
    const sortField = sort_by || 'created_at';
    const order = sort_order || 'desc';

    if (sortField === 'overall_score') {
      query = query.orderBy('surveys.overall_score', order);
    } else if (sortField === 'date') {
      query = query.orderBy('surveys.created_at', order);
    } else {
      query = query.orderBy('surveys.created_at', order);
    }

    const surveys = await query;

    // Get all events and users for dropdowns
    const events = await knex('events')
      .distinct('title')
      .orderBy('title', 'asc');

    const users = await knex('users')
      .where('is_admin', false)
      .select('id', 'name')
      .orderBy('name', 'asc');

    // Add net_promoter_score to each survey
    surveys.forEach(survey => {
      if (survey.recommendation_rating <= 3) {
        survey.net_promoter_score = 'Detractor';
      } else if (survey.recommendation_rating === 4) {
        survey.net_promoter_score = 'Passive';
      } else {
        survey.net_promoter_score = 'Promoter';
      }
    });

    res.render('admin/surveys', {
      title: 'Surveys - Admin - Ella Rises',
      surveys,
      events,
      users,
      search_event: search_event || '',
      search_participant: search_participant || '',
      sort_by: sortField,
      sort_order: order,
      filter_nps: filter_nps || '',
    });
  } catch (error) {
    console.error('Error loading surveys:', error);
    res.status(500).send('Error loading surveys');
  }
});

// Admin view individual survey detail
app.get('/admin/surveys/:surveyId', requireAdmin, async (req, res) => {
  const { surveyId } = req.params;

  try {
    const survey = await knex('surveys')
      .join('users', 'surveys.user_id', 'users.id')
      .join('events', 'surveys.event_id', 'events.id')
      .select('surveys.*', 'users.name as user_name', 'users.email as user_email', 'events.title as event_title')
      .where('surveys.id', surveyId)
      .first();

    if (!survey) {
      return res.status(404).send('Survey not found');
    }

    // Calculate net_promoter_score
    if (survey.recommendation_rating <= 3) {
      survey.net_promoter_score = 'Detractor';
    } else if (survey.recommendation_rating === 4) {
      survey.net_promoter_score = 'Passive';
    } else {
      survey.net_promoter_score = 'Promoter';
    }

    res.render('admin/survey-detail', {
      title: 'Survey Detail - Admin - Ella Rises',
      survey,
    });
  } catch (error) {
    console.error('Error loading survey:', error);
    res.status(500).send('Error loading survey');
  }
});

// ============================================
// ADMIN - MILESTONES MANAGEMENT
// ============================================

// Admin milestones page - view all milestones
app.get('/admin/milestones', requireAdmin, async (req, res) => {
  try {
    const { search, filter_milestone } = req.query;

    // Get all milestone categories
    const milestoneCategories = await knex('milestones')
      .select('*')
      .orderBy('id', 'asc');

    // Get all users (non-admin participants)
    let usersQuery = knex('users')
      .where('is_admin', false)
      .orderBy('name', 'asc');

    // Apply search filter
    if (search) {
      usersQuery = usersQuery.where('name', 'ilike', `%${search}%`);
    }

    const users = await usersQuery;

    // Get all user milestones
    const userMilestones = await knex('participant_milestones')
      .join('milestones', 'participant_milestones.milestone_id', 'milestones.id')
      .select(
        'participant_milestones.user_id',
        'participant_milestones.milestone_id',
        'participant_milestones.custom_title',
        'participant_milestones.achieved_at',
        'milestones.title as milestone_title'
      );

    // Build a map of user achievements: user_id -> milestone_id -> [milestones]
    const userAchievements = {};
    userMilestones.forEach(um => {
      if (!userAchievements[um.user_id]) {
        userAchievements[um.user_id] = {};
      }
      if (!userAchievements[um.user_id][um.milestone_id]) {
        userAchievements[um.user_id][um.milestone_id] = [];
      }
      userAchievements[um.user_id][um.milestone_id].push(um);
    });

    // Filter by milestone if specified
    let filteredUsers = users;
    if (filter_milestone) {
      filteredUsers = users.filter(user => {
        return userAchievements[user.id] && userAchievements[user.id][filter_milestone];
      });
    }

    res.render('admin/milestones', {
      title: 'Milestones - Admin - Ella Rises',
      users: filteredUsers,
      milestoneCategories,
      userAchievements,
      search: search || '',
      filter_milestone: filter_milestone || '',
    });
  } catch (error) {
    console.error('Error loading milestones:', error);
    res.status(500).send('Error loading milestones');
  }
});

// Admin view user milestone details
app.get('/admin/milestones/user/:userId', requireAdmin, async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await knex('users')
      .where('id', userId)
      .first();

    if (!user) {
      return res.status(404).send('User not found');
    }

    const userMilestones = await knex('participant_milestones')
      .join('milestones', 'participant_milestones.milestone_id', 'milestones.id')
      .where('participant_milestones.user_id', userId)
      .select(
        'participant_milestones.*',
        'milestones.title as milestone_title',
        'milestones.description as milestone_description'
      )
      .orderBy('participant_milestones.achieved_at', 'desc');

    res.render('admin/user-milestones', {
      title: `${user.name}'s Milestones - Admin - Ella Rises`,
      user,
      milestones: userMilestones,
    });
  } catch (error) {
    console.error('Error loading user milestones:', error);
    res.status(500).send('Error loading user milestones');
  }
});

// ============================================
// ADMIN - DONATIONS MANAGEMENT
// ============================================

// Admin donations page - view all donations
app.get('/admin/donations', requireAdmin, async (req, res) => {
  try {
    const donations = await knex('donations')
      .leftJoin('users', 'donations.user_id', 'users.id')
      .select('donations.*', 'users.name as user_name')
      .orderBy('donations.created_at', 'desc');

    res.render('admin/donations', {
      title: 'Donations - Admin - Ella Rises',
      donations,
    });
  } catch (error) {
    console.error('Error loading donations:', error);
    res.status(500).send('Error loading donations');
  }
});

// ============================================
// ADMIN - ANALYTICS PLACEHOLDER
// ============================================

// Admin analytics page - placeholder for future Tableau dashboard
app.get('/admin/analytics', requireAdmin, (req, res) => {
  res.render('admin/analytics', {
    title: 'Analytics - Admin - Ella Rises',
  });
});

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler
app.use((req, res) => {
  res.status(404).send('Page not found');
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop');
});
