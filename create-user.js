// ============================================
// CREATE USER HELPER SCRIPT
// ============================================
// This script helps you create users with properly hashed passwords
// Usage: node create-user.js

const bcrypt = require('bcryptjs');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function createUser() {
  console.log('\n=== Ella Rises - Create User ===\n');

  try {
    const name = await question('Enter name: ');
    const email = await question('Enter email: ');
    const password = await question('Enter password: ');
    const role = await question('Enter role (user/admin) [user]: ') || 'user';

    // Hash the password
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // Generate SQL INSERT statement
    console.log('\n=== Generated SQL ===\n');
    console.log(`INSERT INTO users (name, email, password_hash, role) VALUES`);
    console.log(`('${name}', '${email}', '${password_hash}', '${role}');`);
    console.log('\n=== Copy the SQL above and run it in your PostgreSQL database ===\n');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    rl.close();
  }
}

createUser();
