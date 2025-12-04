#!/bin/bash
# Fix Database Name Mismatch in Elastic Beanstalk
# This script ensures your RDS database is named 'ella_rises' to match your application

set -e

echo "================================================================"
echo "FIX DATABASE NAME MISMATCH"
echo "================================================================"

# Get RDS connection details from EB
echo -e "\n1. Getting RDS connection details from EB..."
RDS_HOSTNAME=$(eb printenv | grep RDS_HOSTNAME | cut -d'=' -f2 | xargs)
RDS_USERNAME=$(eb printenv | grep RDS_USERNAME | cut -d'=' -f2 | xargs)
RDS_PASSWORD=$(eb printenv | grep RDS_PASSWORD | cut -d'=' -f2 | xargs)
RDS_PORT=$(eb printenv | grep RDS_PORT | cut -d'=' -f2 | xargs)

echo "   RDS Host: $RDS_HOSTNAME"
echo "   RDS User: $RDS_USERNAME"
echo "   RDS Port: $RDS_PORT"

# Check current RDS_DB_NAME
echo -e "\n2. Checking current RDS_DB_NAME setting..."
CURRENT_DB=$(eb printenv | grep RDS_DB_NAME | cut -d'=' -f2 | xargs)
echo "   Current: $CURRENT_DB"

if [ "$CURRENT_DB" != "ella_rises" ]; then
    echo "   ⚠️  WARNING: RDS_DB_NAME is set to '$CURRENT_DB' but should be 'ella_rises'"
else
    echo "   ✅ RDS_DB_NAME is correctly set to 'ella_rises'"
fi

# List existing databases
echo -e "\n3. Checking which databases exist in RDS..."
export PGPASSWORD="$RDS_PASSWORD"
psql -h "$RDS_HOSTNAME" -U "$RDS_USERNAME" -d postgres -p "$RDS_PORT" -c "\l" 2>&1 | grep -E "(ebdb|ella_rises)" || echo "   No ebdb or ella_rises database found"

# Check if ella_rises database exists
echo -e "\n4. Checking if 'ella_rises' database exists..."
DB_EXISTS=$(psql -h "$RDS_HOSTNAME" -U "$RDS_USERNAME" -d postgres -p "$RDS_PORT" -tAc "SELECT 1 FROM pg_database WHERE datname='ella_rises'" 2>/dev/null)

if [ "$DB_EXISTS" = "1" ]; then
    echo "   ✅ 'ella_rises' database exists"

    # Check if it has tables
    TABLE_COUNT=$(psql -h "$RDS_HOSTNAME" -U "$RDS_USERNAME" -d ella_rises -p "$RDS_PORT" -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'" 2>/dev/null)
    echo "   Tables in ella_rises: $TABLE_COUNT"

    if [ "$TABLE_COUNT" -eq "0" ]; then
        echo "   ⚠️  Database exists but has no tables!"
        echo "   You need to run: psql -h $RDS_HOSTNAME -U $RDS_USERNAME -d ella_rises -f database-setup.sql"
    fi
else
    echo "   ❌ 'ella_rises' database does NOT exist"
    echo ""
    echo "   Creating 'ella_rises' database..."
    psql -h "$RDS_HOSTNAME" -U "$RDS_USERNAME" -d postgres -p "$RDS_PORT" -c "CREATE DATABASE ella_rises;"

    if [ $? -eq 0 ]; then
        echo "   ✅ 'ella_rises' database created successfully"
    else
        echo "   ❌ Failed to create database"
        exit 1
    fi
fi

# Set RDS_DB_NAME to ella_rises
echo -e "\n5. Setting RDS_DB_NAME to 'ella_rises'..."
eb setenv RDS_DB_NAME=ella_rises

if [ $? -eq 0 ]; then
    echo "   ✅ RDS_DB_NAME set to 'ella_rises'"
else
    echo "   ❌ Failed to set RDS_DB_NAME"
    exit 1
fi

echo -e "\n================================================================"
echo "NEXT STEPS:"
echo "================================================================"
echo ""
echo "1. Load the database schema:"
echo "   psql -h $RDS_HOSTNAME -U $RDS_USERNAME -d ella_rises -p $RDS_PORT -f database-setup.sql"
echo ""
echo "2. Verify users table:"
echo "   psql -h $RDS_HOSTNAME -U $RDS_USERNAME -d ella_rises -p $RDS_PORT -c \"SELECT COUNT(*) FROM users;\""
echo ""
echo "3. Check EB logs:"
echo "   eb logs | grep -i database"
echo ""
echo "4. Test login at your EB URL with:"
echo "   Email: admin@ellarises.org"
echo "   Password: admin123"
echo ""
echo "================================================================"

unset PGPASSWORD
