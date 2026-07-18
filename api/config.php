<?php
declare(strict_types=1);

/**
 * api/config.php — bootstrap: env loading, DB connection, sessions,
 * security headers, CSRF helpers, rate limiting, JSON response helpers.
 *
 * Nothing in here is committed to git (this file itself is still
 * gitignored) but it now reads secrets from environment variables instead
 * of hardcoded constants, so the SAME file works across dev/staging/prod
 * just by changing the environment, and secrets never touch the repo.
 */

// ---------------------------------------------------------------
// 1. Load environment (.env) — a minimal parser, no Composer needed.
//    In production, prefer real env vars injected by your host/orchestrator
//    (Docker, systemd EnvironmentFile, etc.) over a checked-in .env file.
// ---------------------------------------------------------------
// Values are stored in a plain array rather than via putenv()/getenv() —
// several shared hosts (InfinityFree included) disable or sandbox putenv(),
// which silently breaks getenv() lookups even when the file itself parses
// correctly.
function loadEnv(string $path): array {
    $vars = [];
    if (!is_file($path)) return $vars;
    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        if (str_starts_with(trim($line), '#') || !str_contains($line, '=')) continue;
        [$key, $value] = array_map('trim', explode('=', $line, 2));
        $vars[$key] = trim($value, "\"'");
    }
    return $vars;
}
$GLOBALS['__env'] = loadEnv(__DIR__ . '/../.env');

function env(string $key, ?string $default = null): ?string {
    // Real server-set env vars still take priority if present; otherwise
    // fall back to the parsed .env file.
    $serverVal = getenv($key);
    if ($serverVal !== false) return $serverVal;
    return $GLOBALS['__env'][$key] ?? $default;
}

// Defaults to "development" so a fresh checkout with no .env yet still
// runs over plain HTTP without silently locking out session cookies
// (secure cookies require HTTPS — see the session config below).
// Real deployments MUST set APP_ENV=production in .env; don't rely on
// this fallback for production security.
$APP_ENV = env('APP_ENV', 'development');

// ---------------------------------------------------------------
// 2. Security headers — sent on every API response.
// ---------------------------------------------------------------
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: strict-origin-when-cross-origin');
header("Content-Security-Policy: default-src 'self'; frame-ancestors 'none'");
if ($APP_ENV === 'production') {
    header('Strict-Transport-Security: max-age=63072000; includeSubDomains; preload');
}
// NOTE: the old wildcard `Access-Control-Allow-Origin: *` has been REMOVED.
// This is a same-origin SPA authenticated via session cookies — CORS should
// not be enabled at all. If you ever need a separate frontend origin, set an
// explicit allow-list here (never `*` combined with credentials).

// ---------------------------------------------------------------
// 3. Sessions — secure cookie flags + Redis-ready for horizontal scaling.
// ---------------------------------------------------------------
$sessionSecure = $APP_ENV === 'production';
session_set_cookie_params([
    'lifetime' => 0,
    'path'     => '/',
    'domain'   => env('COOKIE_DOMAIN', ''),
    'secure'   => $sessionSecure,   // requires HTTPS in production
    'httponly' => true,
    'samesite' => 'Lax',
]);

// To scale beyond a single app server, point sessions at Redis instead of
// the local filesystem (uncomment once Redis is provisioned):
// ini_set('session.save_handler', 'redis');
// ini_set('session.save_path', env('REDIS_SESSION_DSN', 'tcp://127.0.0.1:6379'));

session_start();

// Regenerate the session ID periodically to limit session-fixation windows,
// without doing it on literally every request (that would break concurrent
// tabs mid-regeneration).
if (empty($_SESSION['_last_regen']) || (time() - $_SESSION['_last_regen']) > 900) {
    session_regenerate_id(true);
    $_SESSION['_last_regen'] = time();
}

// ---------------------------------------------------------------
// 4. Database (PDO, prepared statements everywhere).
// ---------------------------------------------------------------
function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $host = env('DB_HOST', 'localhost');
        $name = env('DB_NAME', 'syncup');
        $user = env('DB_USER', 'root');
        $pass = env('DB_PASS', '');
        $dsn  = "mysql:host=$host;dbname=$name;charset=utf8mb4";
        try {
            $pdo = new PDO($dsn, $user, $pass, [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false, // real prepared statements
            ]);
        } catch (PDOException $e) {
            error_log('[DB] Connection failed: ' . $e->getMessage());
            jsonError('Service temporarily unavailable', 503);
        }
    }
    return $pdo;
}

// ---------------------------------------------------------------
// 5. JSON response helpers — errors NEVER leak internals to the client.
// ---------------------------------------------------------------
function jsonResponse(array $data, int $status = 200): void {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * @param string $publicMessage  Safe, user-facing message.
 * @param int    $status
 * @param string|null $internal  Real cause, written to the server log only.
 */
function jsonError(string $publicMessage, int $status = 400, ?string $internal = null): void {
    if ($internal !== null) {
        error_log("[API ERROR] $publicMessage :: $internal");
    }
    jsonResponse(['success' => false, 'error' => $publicMessage], $status);
}

// ---------------------------------------------------------------
// 6. Auth helpers
// ---------------------------------------------------------------
function requireAuth(): array {
    if (empty($_SESSION['user_id'])) {
        jsonError('Not authenticated', 401);
    }
    $stmt = db()->prepare('SELECT id, username, display_name, email, timezone, email_verified FROM users WHERE id = ?');
    $stmt->execute([$_SESSION['user_id']]);
    $user = $stmt->fetch();
    if (!$user) {
        session_destroy();
        jsonError('Not authenticated', 401);
    }
    return $user;
}

// ---------------------------------------------------------------
// 7. CSRF protection
//    Token is bound to the session, issued via GET /auth.php?action=csrf,
//    and required as the `X-CSRF-Token` header on every state-changing
//    (non-GET) request.
// ---------------------------------------------------------------
function csrfToken(): string {
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function requireCsrf(): void {
    if ($_SERVER['REQUEST_METHOD'] === 'GET' || $_SERVER['REQUEST_METHOD'] === 'OPTIONS') return;
    $sent = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    $expected = $_SESSION['csrf_token'] ?? '';
    if (!$expected || !$sent || !hash_equals($expected, $sent)) {
        jsonError('Invalid or missing CSRF token', 403);
    }
}

// ---------------------------------------------------------------
// 8. Rate limiting — IP + username based, backed by the `login_attempts`
//    table. Cheap and effective without adding a Redis dependency; swap
//    for a Redis token-bucket if you outgrow this.
// ---------------------------------------------------------------
function clientIp(): string {
    return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
}

function recordLoginAttempt(?string $username, bool $succeeded): void {
    $stmt = db()->prepare(
        'INSERT INTO login_attempts (ip_address, username, succeeded) VALUES (?, ?, ?)'
    );
    $stmt->execute([clientIp(), $username, $succeeded ? 1 : 0]);
}

/**
 * Blocks the request with 429 if either the IP or the username has had too
 * many failed attempts in the last 15 minutes.
 */
function enforceLoginRateLimit(?string $username): void {
    $db = db();
    $windowStart = date('Y-m-d H:i:s', time() - 900);

    $ipStmt = $db->prepare(
        'SELECT COUNT(*) AS c FROM login_attempts
         WHERE ip_address = ? AND succeeded = 0 AND created_at > ?'
    );
    $ipStmt->execute([clientIp(), $windowStart]);
    if ((int)$ipStmt->fetch()['c'] >= 20) {
        jsonError('Too many attempts. Please try again later.', 429);
    }

    if ($username) {
        $userStmt = $db->prepare(
            'SELECT COUNT(*) AS c FROM login_attempts
             WHERE username = ? AND succeeded = 0 AND created_at > ?'
        );
        $userStmt->execute([$username, $windowStart]);
        if ((int)$userStmt->fetch()['c'] >= 8) {
            jsonError('Too many failed attempts for this account. Please try again later.', 429);
        }
    }
}

// ---------------------------------------------------------------
// 9. Input helper
// ---------------------------------------------------------------
function jsonBody(): array {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}
