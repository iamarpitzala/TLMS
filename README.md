# TLMS (Transaction & Ledger Management System) - Technical Workflow

## System Overview

TLMS is a Node.js-based **Transaction & Ledger Management System** designed to track financial transactions between accounts with comprehensive ledger entries, audit logging, and role-based access control. The system manages multi-party transactions (debit & credit parties) with commission tracking and trial balance reconciliation.

---

## Technology Stack

### Backend
- **Runtime**: Node.js 22.x
- **Framework**: Express.js 4.18.3
- **Session Management**: express-session with PostgreSQL store (connect-pg-simple)
- **Database**: PostgreSQL with pg 8.22.0
- **Authentication**: bcryptjs for password hashing
- **Scheduling**: node-cron for automated backups
- **Export Formats**: PDFKit (PDF), ExcelJS (Excel)
- **Cloud Storage**: AWS S3 SDK for backup storage
- **Environment**: dotenv for configuration

### Frontend
- **HTML/CSS/JS**: Vanilla JavaScript (no framework)
- **API Communication**: Fetch API (custom wrapper in api.js)
- **UI Patterns**: Modal dialogs, dynamic page switching, client-side validation

---

## Database Schema

### Core Tables

#### `users`
- **Columns**: id, username, password_hash, role, is_active, created_at
- **Roles**: administrator, operator, viewer
- **Default Users (seeded)**: 
  - admin / admin123 (administrator)
  - operator / operator123 (operator)
  - viewer / viewer123 (viewer)

#### `accounts`
- **Columns**: id, account_name, mobile_number, opening_amount, balance_date, group_name, parent_account, is_active, created_at, updated_at
- **Purpose**: Ledger accounts (parties in transactions)
- **Hierarchy**: Supports parent-child account structure via parent_account field

#### `transactions`
- **Columns**: id, voucher_number, transaction_date, transaction_city, token_details, amount, wallet_city, debit_party_id, debit_rate, debit_commission, remarks, message, credit_wallet_city, credit_party_id, credit_rate, credit_commission, status, created_by, verified_by, verified_at, created_at
- **Key Fields**:
  - **voucher_number**: Atomic auto-generated format VCH-YYYYMMDD-NNNNN
  - **amount**: Base transaction amount (stored in DB as-is, displayed as × 1000 on frontend)
  - **commission**: Per-mille values (0-1000 represents 0-100%), converted to base-currency units for ledger
  - **status**: "Pending Verification" (initial) → "Verified" (after ledger creation)
- **Indexes**: transaction_date, debit_party_id, credit_party_id

#### `ledger_entries`
- **Columns**: id, account_id, transaction_id, entry_date, entry_type, particulars, message, brokerage, amount, is_verified, verified_by, verified_at, is_locked, created_at
- **entry_type**: debit | credit | commission_debit | commission_credit (current schema only uses debit & credit)
- **Key Concept**: 
  - Created automatically when transaction is verified
  - Ledger amount = base amount + commission (commission is brokerage field)
  - Single entry per party per transaction (no separate commission rows)
  - Locked after verification, can only be unlocked by admin
- **Indexes**: account_id, entry_date

#### `audit_log`
- **Columns**: id, actor_id, actor_name, action, table_name, record_id, field_name, old_value, new_value, timestamp
- **Purpose**: Complete audit trail of all mutations
- **Captured Actions**: login, logout, login_failed, create, update, delete, password_change, role_change, verify_transaction, disable, enable, reactivate

#### `voucher_counter`
- **Columns**: id (PK=1), last_seq
- **Purpose**: Atomic sequence for generating unique voucher numbers
- **Usage**: Incremented transactionally to ensure no duplicates

#### `user_sessions` (created by connect-pg-simple)
- **Columns**: sid, sess, expire
- **Purpose**: PostgreSQL-backed session store for express-session

---

## Authentication & Authorization

### Session Management
- **Store**: PostgreSQL (via connect-pg-simple) with auto-cleanup of expired sessions
- **Secret**: SESSION_SECRET environment variable (fails production if using placeholder)
- **Cookie**: 
  - `secure: true` in production (HTTPS only)
  - `httpOnly: true` (prevents XSS access)
  - `sameSite: 'lax'` (CSRF protection)
  - `maxAge: 8 hours`

### Middleware

#### `requireLogin`
- **Usage**: All authenticated endpoints
- **Behavior**: Returns 401 if no session.user
- **Routes**: ALL API endpoints except `/api/auth/login` and `/api/auth/logout`

#### `requireRole(...roles)`
- **Usage**: Role-based access control
- **Behavior**: Returns 401 if not authenticated, 403 if role not in whitelist
- **Example**: `requireRole('administrator', 'operator')`

#### `requireOperator`
- **Alias**: `requireRole('operator', 'administrator')`
- **Routes**: Account CRUD, Transaction CRUD, Ledger verification

#### `requireAdmin`
- **Alias**: `requireRole('administrator')`
- **Routes**: User management, Audit log access, Transaction un-approval, Transaction deletion, Ledger entry unlocking

#### `requireVerifier`
- **Alias**: `requireRole('viewer', 'operator', 'administrator')`
- **Current**: Not actively used in route handlers (defined but unused)

### Audit Middleware
- **Function**: `audit(req, action, tableName, recordId, oldData, newData)`
- **Behavior**: Fire-and-forget; never throws into request handler (wrapped in try-catch)
- **Activation**: Called manually from route handlers (not automatic)
- **Captures**: User ID/username, action type, table, field-level changes (before/after)

---

## API Routes & Endpoints

### `/api/auth` - Authentication (NO middleware for login/logout/me endpoints)

| Method | Endpoint | Middleware | Description |
|--------|----------|------------|-------------|
| POST | /login | None | Login; creates session.user {id, username, role} |
| POST | /logout | None | Destroys session |
| GET | /me | None | Returns current session.user or 401 |

**Notes**: 
- Login audits both success and failures
- Inactive users get 403 with deactivation message
- No middleware on these routes; session is checked in handler

---

### `/api/users` - User Management (ALL require `requireAdmin`)

| Method | Endpoint | Middleware | Description |
|--------|----------|------------|-------------|
| GET | / | requireAdmin | List all users (id, username, role, is_active, created_at) |
| POST | / | requireAdmin | Create new user {username, password, role} |
| PATCH | /:id/password | requireAdmin | Set user password (min 6 chars) |
| PATCH | /:id/role | requireAdmin | Change user role |
| PATCH | /:id/reactivate | requireAdmin | Reactivate deactivated user |
| DELETE | /:id | requireAdmin | Deactivate user (soft delete via is_active=0) |

**Validations**:
- Username uniqueness (case-insensitive)
- Cannot deactivate/change own account
- Roles: administrator, operator, viewer
- Password minimum 6 characters

---

### `/api/accounts` - Account Management

| Method | Endpoint | Middleware | Description |
|--------|----------|------------|-------------|
| GET | / | requireLogin | List accounts; supports filters: search (name/mobile/group), active |
| GET | /:id | requireLogin | Get single account details |
| POST | / | requireOperator | Create account {account_name, mobile_number, opening_amount, balance_date, group_name, parent_account} |
| PUT | /:id | requireOperator | Full account update |
| PATCH | /:id/disable | requireOperator | Toggle is_active (0 ↔ 1) |

**Validations**:
- account_name mandatory and unique (case-insensitive)
- opening_amount defaults to 0
- Cannot create transaction with inactive party accounts

---

### `/api/transactions` - Transaction Management

| Method | Endpoint | Middleware | Description |
|--------|----------|------------|-------------|
| GET | / | requireLogin | List transactions with pagination (default 50/page); filters: account, debit, credit, amount, city, search, date_from, date_to, status |
| GET | /:id | requireLogin | Get transaction + joined debit/credit party names |
| POST | / | requireOperator | Create transaction (status="Pending Verification", no ledger yet) |
| PATCH | /:id | requireOperator | Edit transaction (any status); syncs ledger if already verified |
| PATCH | /:id/verify | requireOperator | Verify & create 2 ledger entries (debit + credit); status → "Verified" |
| PATCH | /:id/unapprove | requireOperator (admin-check) | Admin-only: revert Verified → Pending Verification; deletes ledger entries |
| DELETE | /:id | requireOperator (admin-check) | Admin-only: hard delete pending transaction |

**Key Behaviors**:
- **Pending State**: Created with "Pending Verification"; no ledger entries
- **Verification**: On verify, 2 ledger entries created (debit + credit with commission-adjusted amounts)
- **Commission Handling**: Per-mille value (0-1000) converted to base-currency; signed values allow net credit/debit
  - Ledger debit amount = base + debit_commission
  - Ledger credit amount = base + credit_commission
- **Editing**: 
  - Pending: can edit any field, no ledger sync
  - Verified: edits sync ledger entries for both parties
- **Deletion**: Pending only; verified transactions must be un-approved first

---

### `/api/ledger` - Ledger & Audit

| Method | Endpoint | Middleware | Description |
|--------|----------|------------|-------------|
| GET | / | requireLogin | Ledger entries for account {account_id required}; filters: type (debit/credit/all), date_from, date_to; returns data + totals |
| GET | /audit | requireAdmin | Last 1000 audit log entries (newest first) |

**Ledger Structure**:
- Filters by account_id (required)
- Returns individual ledger entries with running totals (brokerage, amount)
- No mutations on /api/ledger (read-only)

---

### `/api/trial-balance` - Trial Balance & Verification

| Method | Endpoint | Middleware | Description |
|--------|----------|------------|-------------|
| GET | / | requireLogin | Trial balance for all active accounts; aggregates ledger entries; returns account-level summary + verification status |
| PATCH | /entries/:id/verify | requireOperator | Mark ledger entry verified; locks it (is_locked=1); blocks further edits |
| PATCH | /entries/:id/unlock | requireAdmin | Admin-only: unlock and reset entry for re-verification or edit |

**Trial Balance Computation**:
- Opens query in parallel: accounts, aggregated sums (debit/credit totals), ledger entries
- Per-account: opening_amount, debit_total, credit_total, closing balance (opening + credit - debit)
- Opens as credit if ≥ 0, debit if < 0
- Returns entry-level details (entries array per account) for granular verification
- Verification status: account is_verified=true only if ALL entries are verified

---

### `/api/export` - Export (PDF & Excel)

| Method | Endpoint | Middleware | Description |
|--------|----------|------------|-------------|
| GET | /ledger/pdf | requireLogin | Ledger PDF with opening balance, data rows, running balance, totals |
| GET | /ledger/excel | requireLogin | Ledger Excel workbook |
| GET | /trial-balance/pdf | requireLogin | Trial balance PDF (trial balance grid + totals) |
| GET | /trial-balance/excel | requireLogin | Trial balance Excel workbook |
| GET | /transactions/pdf | requireLogin | Transactions list PDF (filtered); date range, totals |
| GET | /transactions/excel | requireLogin | Transactions Excel workbook |
| GET | /transaction/pdf | requireLogin | Single transaction voucher PDF (all details) |

**Export Features**:
- Ledger PDF: account-level ledger with opening/closing balance, running balance column, brokerage tracking
- Transactions PDF: multi-row grid with all debit/credit parties, commissions, status
- All exports styled with headers, totals rows, currency formatting
- Amount display: multiplied by 1000 (backend storage as 0.001 units, frontend display in rupees)

---

## Middleware Summary Table

| Middleware | Usage | Where |
|-----------|-------|-------|
| `requireLogin` | Session exists (all authenticated routes) | 75% of API |
| `requireOperator` | Session exists + (operator OR admin) | Accounts, transactions, ledger verification |
| `requireAdmin` | Session exists + administrator role only | User mgmt, audit, transaction approval/deletion, entry unlock |
| `audit(...)` | Manual invocation; logs mutations | All CRUD routes; fire-and-forget pattern |

**Routes WITHOUT Middleware**:
- POST /api/auth/login
- POST /api/auth/logout
- GET /api/auth/me

---

## Data Flow Example: Transaction Verification

### Step 1: Create Transaction (requireOperator)
```
POST /api/transactions
{
  "transaction_date": "2024-01-15",
  "debit_party_id": 1,
  "credit_party_id": 2,
  "amount": 100.50,
  "debit_commission": 50,      // per-mille: 0.05% = 0.05 base units
  "credit_commission": -25     // negative: credit party receives more
}
→ Status: "Pending Verification"
→ Voucher: VCH-20240115-00001
→ Audit: create transaction entry
```

### Step 2: Verify Transaction (requireOperator)
```
PATCH /api/transactions/:id/verify
→ Ledger entry 1 (debit): account=1, amount=100.55 (100.50 + 0.05), entry_type=debit
→ Ledger entry 2 (credit): account=2, amount=100.25 (100.50 - 0.25), entry_type=credit
→ Status: "Verified"
→ verified_by, verified_at set
→ Audit: verify_transaction entry (includes all details)
```

### Step 3: View Trial Balance (requireLogin)
```
GET /api/trial-balance?date_from=2024-01-01&date_to=2024-01-31
→ Account 1: opening=0, closing=0-100.55=-100.55 (debit)
→ Account 2: opening=0, closing=0+100.25=100.25 (credit)
→ is_verified=false until individual entries verified (PATCH /entries/:id/verify)
```

### Step 4: Verify Ledger Entry (requireOperator)
```
PATCH /api/trial-balance/entries/:id/verify
→ is_verified=1, is_locked=1, verified_by, verified_at
→ Cannot edit until admin unlocks
→ Audit: verify ledger entry
```

---

## Role Matrix

| Action | Administrator | Operator | Viewer |
|--------|---|---|---|
| View accounts | ✓ | ✓ | ✓ |
| Create/edit account | ✓ | ✓ | ✗ |
| View transactions | ✓ | ✓ | ✓ |
| Create/edit transaction | ✓ | ✓ | ✗ |
| Verify transaction (create ledger) | ✓ | ✓ | ✗ |
| Verify ledger entries | ✓ | ✓ | ✗ |
| Un-approve transaction | ✓ | ✗ | ✗ |
| Delete transaction | ✓ | ✗ | ✗ |
| Unlock ledger entry | ✓ | ✗ | ✗ |
| Manage users | ✓ | ✗ | ✗ |
| View audit log | ✓ | ✗ | ✗ |
| Export (all formats) | ✓ | ✓ | ✓ |

---

## Audit Logging

### Architecture
- **Trigger**: Manual invocation from route handlers (not automatic)
- **Storage**: audit_log table
- **Pattern**: Fire-and-forget; errors never bubble to request handler
- **Fields Captured**: 
  - actor_id, actor_name (from session or request body)
  - action (semantic: login, create, verify_transaction, etc.)
  - table_name, record_id (what was changed)
  - old_value, new_value (JSON stringified for complex objects)
  - timestamp (IST format)

### Covered Actions
- **Authentication**: login, logout, login_failed
- **User Management**: create, password_change, role_change, reactivate, deactivate
- **Accounts**: create, update, enable, disable
- **Transactions**: create, update, verify_transaction, unapprove, delete
- **Ledger**: verify (entry), unlock

### Not Currently Audited (implicit or read-only)
- GET requests (read operations)
- Session token generation
- Backup execution (logged to console, not audit_log)

---

## Environment Configuration

### Required `.env` Variables
```
DATABASE_URL=postgresql://user:password@localhost:5432/tlms
SESSION_SECRET=your-long-random-secret-at-least-32-chars
NODE_ENV=development|production
PORT=3000

# Optional AWS S3 for backup (if using backup script)
AWS_REGION=...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_BACKUP_BUCKET=...
```

### Startup Behavior
- **Development**: Allows placeholder SESSION_SECRET with warning
- **Production**: Exits (exit code 1) if SESSION_SECRET is not set or uses placeholder
- **Database**: Initializes schema and seeds 3 default users on first run

---

## Scheduled Tasks

### Nightly Backup (node-cron)
- **Schedule**: 20:30 UTC (02:00 IST) daily
- **Trigger**: `runBackup()` from scripts/backup.js
- **Target**: AWS S3 (if configured)
- **Error Handling**: Logged to console; does not crash server
- **Configuration**: cron.schedule in server.js

---

## Frontend Architecture

### Pages (public/js/pages/)
- **dashboard.js**: Overview, stats
- **accounts.js**: Account CRUD, list
- **transactions.js**: Transaction CRUD, list, verification workflow
- **ledger.js**: Account ledger view, entry verification
- **trial-balance.js**: Trial balance grid, entry unlock (admin)
- **audit.js**: Audit log viewer (admin)
- **users.js**: User management (admin)

### Core Modules (public/js/)
- **app.js**: Router, page switching, initialization
- **api.js**: Fetch wrapper with error handling
- **modal.js**: Modal UI component

### Styling
- **public/css/style.css**: Global styles, responsive layout

### HTML
- **public/index.html**: SPA entry point; single #app div

---

## Key Design Patterns

### 1. Atomic Voucher Generation
- Uses PostgreSQL transaction + voucher_counter table
- Prevents duplicate voucher numbers even under concurrent load

### 2. Commission Handling
- Stored as per-mille (0-1000) in transactions table
- Converted to base-currency units for ledger entries
- Signed values: positive = charge party, negative = credit to party
- Single ledger row per party (commission embedded in amount field, tracked in brokerage field)

### 3. Transaction State Machine
```
Pending Verification 
  ↓ (verify endpoint)
Verified (ledger entries created)
  ↓ (edit/unapprove by admin)
Pending Verification (ledger entries deleted)
```

### 4. Ledger Entry Lock
- After verification, entry is locked (is_locked=1)
- Prevents accidental edits
- Only admin can unlock (PATCH /entries/:id/unlock)
- Unlock resets is_verified=0 for re-verification

### 5. IST Timestamps
- Database stores TEXT timestamps (YYYY-MM-DD HH:MM:SS in IST)
- Generated in Node.js via nowIST() helper (UTC offset +5:30)
- Ensures consistent timezone for audit, transaction dates, ledger dates

### 6. Pagination
- GET /api/transactions returns {data, total, page, limit}
- Default: page=1, limit=50
- Offsets calculated: (page - 1) * limit

---

## Deployment Notes

### Production Checklist
- [ ] Set NODE_ENV=production
- [ ] Generate strong SESSION_SECRET (min 32 random chars)
- [ ] Configure DATABASE_URL (production PG instance)
- [ ] Enable HTTPS (set cookie.secure=true)
- [ ] Set up AWS credentials for backups (if needed)
- [ ] Seed default users; change passwords immediately
- [ ] Configure firewall to restrict database access
- [ ] Enable SSL/TLS for PG connection
- [ ] Monitor disk space for backups
- [ ] Set up log aggregation for audit trails

### Scaling Considerations
- PostgreSQL session store allows horizontal scaling (sessions in shared DB)
- Voucher counter uses atomic transaction; supports concurrent requests
- Audit logging is fire-and-forget; won't block API responses
- Export PDF/Excel generation may be CPU-bound for large datasets; consider async queue

---

## API Response Codes

- **200**: Success (GET, PATCH, PUT)
- **201**: Created (POST)
- **400**: Validation error (missing fields, invalid input)
- **401**: Not authenticated (no session)
- **403**: Not authorized (insufficient role)
- **404**: Resource not found
- **409**: Conflict (duplicate unique field, e.g., duplicate username)
- **500**: Server error (DB error, unexpected exception)

---

## Security Considerations

### Authentication
- Passwords hashed with bcryptjs (10 rounds)
- Session secret must be strong; validated at startup in production
- Sessions stored in database; survive server restarts

### Authorization
- All mutation endpoints require appropriate role
- Audit trail tracks all changes with actor identity
- Admin-only operations (unlock, unapprove, delete) double-checked in handler

### Data Protection
- Sensitive values (passwords, session tokens) never logged in audit
- IST timezone conversion prevents timezone-based fraud
- Ledger entries locked after verification to prevent tampering
- Atomic transactions prevent race conditions (voucher generation, ledger creation)

### SQL Injection
- Parameterized queries throughout (pg library handles escaping)
- No string interpolation in SQL

---

## Error Handling

### Database Errors
- Connection failures: logged, process exits
- Query errors: caught and returned as 500 + message

### Request Errors
- Missing/invalid input: 400 + validation message
- Auth failures: 401 (not authenticated) or 403 (forbidden)
- Audit errors: logged to console, never bubble to request (fire-and-forget)

### Session Errors
- Expired session: treated as 401 (not authenticated)
- Invalid secret: startup fails in production

---

## Future Enhancement Opportunities

1. **Rate Limiting**: Add express-rate-limit to prevent brute-force attacks
2. **Pagination Optimization**: Cache trial balance computation for large datasets
3. **Webhook Notifications**: Notify on transaction verification/approval
4. **Bulk Import**: CSV upload for accounts/transactions
5. **Recurring Transactions**: Support standing orders/recurring entries
6. **Multi-Currency**: Support forex conversions, currency codes
7. **Approval Workflows**: Multi-level approval for large transactions
8. **Bank Integration**: Direct feed from bank APIs
9. **Data Encryption**: Encrypt sensitive fields (phone numbers, token details) at rest
10. **API Documentation**: OpenAPI/Swagger for client integration

---

## Summary

TLMS is a **role-based, audit-enabled ledger system** built on Node.js + PostgreSQL with the following distinguishing features:

- **Dual-party transactions**: Every transaction has a debit and credit party
- **Commission handling**: Per-mille-based charges tracked per party
- **Atomic voucher generation**: Prevents duplicates under load
- **Comprehensive audit trail**: All mutations logged with actor identity and before/after values
- **Trial balance verification**: Per-account verification status across date ranges
- **Role-based access**: Administrator, operator, viewer with granular permissions
- **Multi-format export**: PDF and Excel for ledger, trial balance, and transactions
- **PostgreSQL session store**: Horizontal scalability, persistent sessions

The system prioritizes data integrity (atomic transactions, locking), auditability (comprehensive trail), and usability (role-based workflows, verified ledger entries).
