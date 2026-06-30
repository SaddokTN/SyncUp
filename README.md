# SyncUp — Find time together

A full-stack scheduling app where you and your friends mark your available times and instantly see when everyone's free — between **6 AM and 11 PM**, across all 7 days.

---

## Features

- **Register & login** (session-based auth with bcrypt passwords)
- **Interactive time grid** — click to toggle your free hours per day
- **Groups** — create a group, share the invite code, friends join and add their availability
- **Overlap view** — the app highlights every block when ALL group members are free
- **Invite codes** — click to copy; share with friends via any channel

---

## File structure

```
syncup/
├── index.html          ← Single-page app shell
├── schema.sql          ← MySQL schema (run once)
├── css/
│   └── style.css       ← All styles
├── js/
│   └── app.js          ← Frontend logic
└── api/
    ├── config.php      ← DB config + helpers
    ├── auth.php        ← Register / login / logout / me
    ├── availability.php ← Get / save availability
    └── groups.php      ← Create / join / list / overlap
```

---

## Requirements

- PHP 7.4+ (8.x recommended)
- MySQL 5.7+ or MariaDB 10.3+
- A web server (Apache/Nginx) — or use PHP's built-in server for local dev

---

## Setup

### 1. Database

```sql
-- In your MySQL client or phpMyAdmin:
source /path/to/syncup/schema.sql;
```

### 2. Configure DB credentials

Edit `api/config.php`:

```php
define('DB_HOST', 'localhost');
define('DB_NAME', 'syncup');
define('DB_USER', 'your_db_user');
define('DB_PASS', 'your_db_password');
```

### 3. Deploy files

Copy all files to your web server's document root (e.g. `/var/www/html/syncup/`).

### 4. Local development (PHP built-in server)

```bash
cd syncup
php -S localhost:8080
# then open http://localhost:8080
```

### 5. Apache `.htaccess` (optional, for clean URLs)

```apache
Options -Indexes
```

---

## How to use

1. **Register** an account on the login page
2. Go to **My availability** and click the time grid cells to mark when you're free (teal = free)
3. Hit **Save availability**
4. Click **New group**, give it a name
5. Share the **invite code** (shown in the group view) with your friends
6. Friends sign up, join via the code, and add their own availability
7. Open the group — the grid shows:
   - 🟦 Your available times
   - 🟩 **Glowing teal** = everyone is free at the same time

---

## Security notes

- Passwords are hashed with `password_hash()` (bcrypt)
- All DB queries use PDO prepared statements (no SQL injection)
- Sessions use `httponly` cookies
- Move `api/config.php` outside your webroot in production, or load credentials from environment variables
- Add HTTPS in production
