<?php
declare(strict_types=1);
// api/auth.php — register, login, logout, me, update, delete, password reset
require_once __DIR__ . '/config.php';

header('Content-Type: application/json');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;

$action = $_GET['action'] ?? '';

// CSRF is required for every mutating action. `csrf` and `me` are safe GETs.
if (!in_array($action, ['csrf', 'me'], true)) {
    requireCsrf();
}

switch ($action) {
    case 'csrf':            jsonResponse(['success' => true, 'token' => csrfToken()]); break;
    case 'register':        handleRegister();      break;
    case 'login':            handleLogin();         break;
    case 'logout':           handleLogout();        break;
    case 'me':                handleMe();            break;
    case 'update':           handleUpdate();        break;
    case 'delete':           handleDelete();        break;
    case 'request-reset':    handleRequestReset();  break;
    case 'reset-password':   handleResetPassword(); break;
    default:                  jsonError('Unknown action', 404);
}

function validUsername(string $u): bool {
    return (bool)preg_match('/^[a-zA-Z0-9_]{3,30}$/', $u);
}

function validTimezone(string $tz): bool {
    return in_array($tz, timezone_identifiers_list(), true);
}

function handleRegister(): void {
    $body         = jsonBody();
    $username     = trim($body['username'] ?? '');
    $display_name = trim($body['display_name'] ?? '');
    $email        = trim($body['email'] ?? '');
    $password     = $body['password'] ?? '';
    $timezone     = trim($body['timezone'] ?? 'UTC');

    if (!$username || !$display_name || !$email || !$password) {
        jsonError('All fields are required');
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        jsonError('Invalid email address');
    }
    if (strlen($password) < 8) {
        jsonError('Password must be at least 8 characters');
    }
    if (!validUsername($username)) {
        jsonError('Username must be 3–30 alphanumeric characters or underscores');
    }
    if (!validTimezone($timezone)) {
        $timezone = 'UTC';
    }

    $db = db();
    $stmt = $db->prepare('SELECT id FROM users WHERE username = ? OR email = ?');
    $stmt->execute([$username, $email]);
    if ($stmt->fetch()) {
        jsonError('Username or email already taken');
    }

    $hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
    $stmt = $db->prepare(
        'INSERT INTO users (username, display_name, email, password_hash, timezone) VALUES (?, ?, ?, ?, ?)'
    );
    $stmt->execute([$username, $display_name, $email, $hash, $timezone]);
    $userId = (int)$db->lastInsertId();

    // Prevent session fixation: never reuse whatever session ID existed
    // before authentication succeeded.
    session_regenerate_id(true);
    $_SESSION['user_id']  = $userId;
    $_SESSION['username'] = $username;

    issueEmailVerification($userId, $email); // fire-and-forget; logs on failure

    jsonResponse([
        'success' => true,
        'user' => [
            'id' => $userId, 'username' => $username, 'display_name' => $display_name,
            'email' => $email, 'timezone' => $timezone, 'email_verified' => false,
        ],
        'csrf_token' => csrfToken(),
    ]);
}

function handleLogin(): void {
    $body     = jsonBody();
    $username = trim($body['username'] ?? '');
    $password = $body['password'] ?? '';

    if (!$username || !$password) jsonError('Username and password required');

    enforceLoginRateLimit($username);

    $stmt = db()->prepare(
        'SELECT id, username, display_name, email, password_hash, timezone, email_verified, locked_until
         FROM users WHERE username = ?'
    );
    $stmt->execute([$username]);
    $user = $stmt->fetch();

    if ($user && $user['locked_until'] && strtotime($user['locked_until']) > time()) {
        recordLoginAttempt($username, false);
        jsonError('Account temporarily locked due to failed attempts. Try again later.', 429);
    }

    if (!$user || !password_verify($password, $user['password_hash'])) {
        recordLoginAttempt($username, false);
        if ($user) bumpFailedLogins((int)$user['id']);
        // Deliberately identical message for "no such user" and "wrong
        // password" — don't let an attacker enumerate valid usernames.
        jsonError('Invalid username or password', 401);
    }

    recordLoginAttempt($username, true);
    resetFailedLogins((int)$user['id']);

    session_regenerate_id(true);
    $_SESSION['user_id']  = $user['id'];
    $_SESSION['username'] = $user['username'];

    jsonResponse([
        'success' => true,
        'user' => [
            'id' => $user['id'], 'username' => $user['username'], 'display_name' => $user['display_name'],
            'email' => $user['email'], 'timezone' => $user['timezone'], 'email_verified' => (bool)$user['email_verified'],
        ],
        'csrf_token' => csrfToken(),
    ]);
}

function bumpFailedLogins(int $userId): void {
    $db = db();
    $db->prepare('UPDATE users SET failed_logins = failed_logins + 1 WHERE id = ?')->execute([$userId]);
    $stmt = $db->prepare('SELECT failed_logins FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    $count = (int)($stmt->fetch()['failed_logins'] ?? 0);
    if ($count >= 8) {
        $db->prepare('UPDATE users SET locked_until = DATE_ADD(NOW(), INTERVAL 15 MINUTE) WHERE id = ?')
           ->execute([$userId]);
    }
}

function resetFailedLogins(int $userId): void {
    db()->prepare('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?')->execute([$userId]);
}

function handleLogout(): void {
    $_SESSION = [];
    session_destroy();
    jsonResponse(['success' => true]);
}

function handleMe(): void {
    if (empty($_SESSION['user_id'])) {
        jsonResponse(['success' => false, 'user' => null]);
    }
    $stmt = db()->prepare('SELECT id, username, display_name, email, timezone, email_verified FROM users WHERE id = ?');
    $stmt->execute([$_SESSION['user_id']]);
    $user = $stmt->fetch();
    if (!$user) jsonResponse(['success' => false, 'user' => null]);
    $user['email_verified'] = (bool)$user['email_verified'];
    jsonResponse(['success' => true, 'user' => $user, 'csrf_token' => csrfToken()]);
}

function handleUpdate(): void {
    $user = requireAuth();
    $body         = jsonBody();
    $username     = trim($body['username'] ?? '');
    $display_name = trim($body['display_name'] ?? '');
    $email        = trim($body['email'] ?? '');
    $timezone     = trim($body['timezone'] ?? $user['timezone']);

    if (!$username || !$display_name || !$email) jsonError('All fields are required');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) jsonError('Invalid email address');
    if (!validUsername($username)) jsonError('Username must be 3–30 alphanumeric characters or underscores');
    if (!validTimezone($timezone)) jsonError('Unrecognized timezone');

    $db = db();
    $stmt = $db->prepare('SELECT id FROM users WHERE (username = ? OR email = ?) AND id != ?');
    $stmt->execute([$username, $email, $user['id']]);
    if ($stmt->fetch()) jsonError('Username or email already taken');

    $emailChanged = $email !== $user['email'];
    $stmt = $db->prepare(
        'UPDATE users SET username = ?, display_name = ?, email = ?, timezone = ?, email_verified = ? WHERE id = ?'
    );
    // Changing your email re-requires verification — otherwise someone
    // could take over an unverified account by relabeling the email field.
    $stmt->execute([$username, $display_name, $email, $timezone, $emailChanged ? 0 : 1, $user['id']]);
    $_SESSION['username'] = $username;

    if ($emailChanged) issueEmailVerification((int)$user['id'], $email);

    jsonResponse([
        'success' => true,
        'user' => [
            'id' => $user['id'], 'username' => $username, 'display_name' => $display_name,
            'email' => $email, 'timezone' => $timezone, 'email_verified' => !$emailChanged,
        ],
    ]);
}

function handleDelete(): void {
    $user     = requireAuth();
    $body     = jsonBody();
    $password = $body['password'] ?? '';

    if (!$password) jsonError('Enter your password to confirm account deletion');

    $db   = db();
    $stmt = $db->prepare('SELECT password_hash FROM users WHERE id = ?');
    $stmt->execute([$user['id']]);
    $row = $stmt->fetch();

    if (!$row || !password_verify($password, $row['password_hash'])) {
        jsonError('Incorrect password', 401);
    }

    $db->beginTransaction();
    try {
        // Hand ownership of any group this user created to its longest-
        // standing other member, so deleting this account doesn't cascade
        // into wiping out groups other people are still using.
        $owned = $db->prepare('SELECT id FROM `groups` WHERE owner_id = ?');
        $owned->execute([$user['id']]);

        foreach ($owned->fetchAll() as $group) {
            $next = $db->prepare(
                'SELECT user_id FROM group_members
                 WHERE group_id = ? AND user_id != ?
                 ORDER BY joined_at ASC LIMIT 1'
            );
            $next->execute([$group['id'], $user['id']]);
            $newOwner = $next->fetch();
            if ($newOwner) {
                $db->prepare('UPDATE `groups` SET owner_id = ? WHERE id = ?')
                   ->execute([$newOwner['user_id'], $group['id']]);
            }
        }

        $db->prepare('DELETE FROM users WHERE id = ?')->execute([$user['id']]);
        $db->commit();
    } catch (Throwable $e) {
        $db->rollBack();
        jsonError('Failed to delete account. Please try again.', 500, $e->getMessage());
    }

    $_SESSION = [];
    session_destroy();
    jsonResponse(['success' => true]);
}

// ---------------------------------------------------------------
// Password reset — request a reset link, then consume it.
// The response to `request-reset` is deliberately identical whether or not
// the email exists, to avoid leaking which emails are registered.
// ---------------------------------------------------------------
function handleRequestReset(): void {
    $body  = jsonBody();
    $email = trim($body['email'] ?? '');
    if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        jsonResponse(['success' => true]); // don't reveal validation details either
        return;
    }

    $db = db();
    $stmt = $db->prepare('SELECT id FROM users WHERE email = ?');
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if ($user) {
        $rawToken  = bin2hex(random_bytes(32));
        $tokenHash = hash('sha256', $rawToken);
        $expires   = date('Y-m-d H:i:s', time() + 3600); // 1 hour

        $db->prepare('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)')
           ->execute([$user['id'], $tokenHash, $expires]);

        sendResetEmail($email, $rawToken); // logs failures, never throws to the client
    }

    // Same response either way — this is intentional, not a bug.
    jsonResponse(['success' => true, 'message' => 'If that email is registered, a reset link has been sent.']);
}

function handleResetPassword(): void {
    $body     = jsonBody();
    $token    = $body['token'] ?? '';
    $password = $body['password'] ?? '';

    if (!$token || !$password) jsonError('Token and new password are required');
    if (strlen($password) < 8) jsonError('Password must be at least 8 characters');

    $tokenHash = hash('sha256', $token);
    $db = db();
    $stmt = $db->prepare(
        'SELECT id, user_id, expires_at, used_at FROM password_resets WHERE token_hash = ?'
    );
    $stmt->execute([$tokenHash]);
    $reset = $stmt->fetch();

    if (!$reset || $reset['used_at'] || strtotime($reset['expires_at']) < time()) {
        jsonError('This reset link is invalid or has expired', 400);
    }

    $hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
    $db->beginTransaction();
    try {
        $db->prepare('UPDATE users SET password_hash = ?, failed_logins = 0, locked_until = NULL WHERE id = ?')
           ->execute([$hash, $reset['user_id']]);
        $db->prepare('UPDATE password_resets SET used_at = NOW() WHERE id = ?')->execute([$reset['id']]);
        $db->commit();
    } catch (Throwable $e) {
        $db->rollBack();
        jsonError('Could not reset password. Please try again.', 500, $e->getMessage());
    }

    jsonResponse(['success' => true, 'message' => 'Password updated. You can now sign in.']);
}

// ---------------------------------------------------------------
// Mail — stubs. Wire these to a real transactional provider (Postmark,
// SES, Mailgun) in production; never send auth emails via bare mail().
// ---------------------------------------------------------------
function sendResetEmail(string $email, string $rawToken): void {
    $link = 'https://' . ($_SERVER['HTTP_HOST'] ?? 'yourdomain.com') . '/reset.html?token=' . urlencode($rawToken);
    // TODO: replace with real provider call. Logging instead of throwing so
    // a mail outage never breaks the (deliberately generic) API response.
    error_log("[MAIL] Password reset for $email: $link");
}

function issueEmailVerification(int $userId, string $email): void {
    $rawToken  = bin2hex(random_bytes(32));
    $tokenHash = hash('sha256', $rawToken);
    $expires   = date('Y-m-d H:i:s', time() + 86400); // 24 hours
    db()->prepare('INSERT INTO email_verifications (user_id, token_hash, expires_at) VALUES (?, ?, ?)')
        ->execute([$userId, $tokenHash, $expires]);
    $link = 'https://' . ($_SERVER['HTTP_HOST'] ?? 'yourdomain.com') . '/verify.html?token=' . urlencode($rawToken);
    error_log("[MAIL] Verify email for $email: $link");
}
