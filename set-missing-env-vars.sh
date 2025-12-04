#!/bin/bash
# Set Missing Environment Variables for Elastic Beanstalk

echo "================================================================"
echo "SETTING MISSING ENVIRONMENT VARIABLES"
echo "================================================================"

# Generate SESSION_SECRET
echo -e "\n1. Generating SESSION_SECRET..."
SESSION_SECRET=$(openssl rand -base64 32)
echo "   Generated: ${SESSION_SECRET:0:20}... (truncated for display)"

# Set SESSION_SECRET
echo -e "\n2. Setting SESSION_SECRET in EB..."
eb setenv SESSION_SECRET="$SESSION_SECRET"

# Set PORT (optional but recommended)
echo -e "\n3. Setting PORT=8080..."
eb setenv PORT=8080

# Email configuration (you'll need to fill in SES credentials)
echo -e "\n4. Email configuration needed!"
echo ""
echo "   ⚠️  You need to set up Amazon SES and then run:"
echo ""
echo "   eb setenv \\"
echo "     MAIL_HOST=\"email-smtp.us-east-2.amazonaws.com\" \\"
echo "     MAIL_PORT=587 \\"
echo "     MAIL_SECURE=false \\"
echo "     MAIL_USER=\"your-ses-smtp-username\" \\"
echo "     MAIL_PASS=\"your-ses-smtp-password\" \\"
echo "     MAIL_FROM=\"\\\"Ella Rises <noreply@ellarises.org>\\\"\" \\"
echo "     MAIL_TO=\"jr.dishman3@gmail.com\""
echo ""
echo "   Steps to get SES credentials:"
echo "   a. Go to AWS Console → Amazon SES (us-east-2)"
echo "   b. Verify sender email: noreply@ellarises.org"
echo "   c. Verify recipient: jr.dishman3@gmail.com (sandbox mode)"
echo "   d. Create SMTP credentials (IAM → Create SMTP credentials)"
echo "   e. Save the SMTP username and password"
echo ""

echo -e "\n================================================================"
echo "VERIFICATION"
echo "================================================================"
echo ""
echo "Check all environment variables:"
echo "  eb printenv"
echo ""
echo "Should show:"
echo "  ✅ DB_SSL=true"
echo "  ✅ NODE_ENV=production"
echo "  ✅ RDS_DB_NAME=ebdb"
echo "  ✅ RDS_HOSTNAME=..."
echo "  ✅ RDS_PASSWORD=..."
echo "  ✅ RDS_PORT=5432"
echo "  ✅ RDS_USERNAME=postgres"
echo "  ✅ SESSION_SECRET=... (newly added)"
echo "  ✅ PORT=8080 (newly added)"
echo "  ⚠️  MAIL_* variables (need to add manually)"
echo ""
echo "================================================================"
