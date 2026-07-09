<?php
// api/auth.php — Handles: register, login, logout, me
require_once __DIR__ . '/config.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'register':
        handleRegister();
        break;
    case 'login':
        handleLogin();
        break;
    case 'logout':
        handleLogout();
        break;
    case 'me':
        handleMe();
        break;
    case 'update':
        handleUpdate();
        break;
    case 'delete':
        handleDelete();
        break;
    default:
        jsonError('Unknown action');
}

function handleRegister(): void {
    $body = json_decode(file_get_contents('php://input'), true);
    $username     = trim($body['username'] ?? '');
    $display_name = trim($body['display_name'] ?? '');
    $email        = trim($body['email'] ?? '');
    $password     = $body['password'] ?? '';

    if (!$username || !$display_name || !$email || !$password) {
        jsonError('All fields are required');
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        jsonError('Invalid email address');
    }
    if (strlen($password) < 6) {
        jsonError('Password must be at least 6 characters');
    }
    if (!preg_match('/^[a-zA-Z0-9_]{3,30}$/', $username)) {
        jsonError('Username must be 3–30 alphanumeric characters or underscores');
    }

    $db = db();
    // Check uniqueness
    $stmt = $db->prepare('SELECT id FROM users WHERE username = ? OR email = ?');
    $stmt->execute([$username, $email]);
    if ($stmt->fetch()) {
        jsonError('Username or email already taken');
    }

    $hash = password_hash($password, PASSWORD_BCRYPT);
    $stmt = $db->prepare('INSERT INTO users (username, display_name, email, password_hash) VALUES (?, ?, ?, ?)');
    $stmt->execute([$username, $display_name, $email, $hash]);

    $userId = (int)$db->lastInsertId();
    $_SESSION['user_id']  = $userId;
    $_SESSION['username'] = $username;

    jsonResponse([
        'success' => true,
        'user' => ['id' => $userId, 'username' => $username, 'display_name' => $display_name, 'email' => $email]
    ]);
}

function handleLogin(): void {
    $body     = json_decode(file_get_contents('php://input'), true);
    $username = trim($body['username'] ?? '');
    $password = $body['password'] ?? '';

    if (!$username || !$password) jsonError('Username and password required');

    $stmt = db()->prepare('SELECT id, username, display_name, email, password_hash FROM users WHERE username = ?');
    $stmt->execute([$username]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password_hash'])) {
        jsonError('Invalid username or password', 401);
    }

    $_SESSION['user_id']  = $user['id'];
    $_SESSION['username'] = $user['username'];

    jsonResponse([
        'success' => true,
        'user' => ['id' => $user['id'], 'username' => $user['username'], 'display_name' => $user['display_name'], 'email' => $user['email']]
    ]);
}

function handleLogout(): void {
    session_destroy();
    jsonResponse(['success' => true]);
}

function handleMe(): void {
    if (empty($_SESSION['user_id'])) {
        jsonResponse(['success' => false, 'user' => null]);
    }
    $stmt = db()->prepare('SELECT id, username, display_name, email FROM users WHERE id = ?');
    $stmt->execute([$_SESSION['user_id']]);
    $user = $stmt->fetch();
    jsonResponse(['success' => true, 'user' => $user]);
}

// Update display name / username / email
function handleUpdate(): void {
    $user = requireAuth();
    $body         = json_decode(file_get_contents('php://input'), true);
    $username     = trim($body['username'] ?? '');
    $display_name = trim($body['display_name'] ?? '');
    $email        = trim($body['email'] ?? '');

    if (!$username || !$display_name || !$email) {
        jsonError('All fields are required');
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        jsonError('Invalid email address');
    }
    if (!preg_match('/^[a-zA-Z0-9_]{3,30}$/', $username)) {
        jsonError('Username must be 3–30 alphanumeric characters or underscores');
    }

    $db = db();
    // Check uniqueness against every OTHER user (excluding this one)
    $stmt = $db->prepare('SELECT id FROM users WHERE (username = ? OR email = ?) AND id != ?');
    $stmt->execute([$username, $email, $user['id']]);
    if ($stmt->fetch()) {
        jsonError('Username or email already taken');
    }

    $db->prepare('UPDATE users SET username = ?, display_name = ?, email = ? WHERE id = ?')
       ->execute([$username, $display_name, $email, $user['id']]);

    // Keep the session's username in sync in case it changed
    $_SESSION['username'] = $username;

    jsonResponse([
        'success' => true,
        'user' => ['id' => $user['id'], 'username' => $username, 'display_name' => $display_name, 'email' => $email]
    ]);
}

// Permanently delete the current user's account
function handleDelete(): void {
    $user     = requireAuth();
    $body     = json_decode(file_get_contents('php://input'), true);
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
        // `groups.owner_id` has ON DELETE CASCADE back to users, so deleting
        // this user would normally wipe out every group they created —
        // taking every other member's group down with it. Hand ownership of
        // any such group to its longest-standing other member first; groups
        // where this user is the only member are left alone and will simply
        // cascade-delete below (nobody else is in them anyway).
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

        // Cascades from here: this user's group_members rows (they leave
        // every group) and availability rows, plus any group they still
        // owned with no other members.
        $db->prepare('DELETE FROM users WHERE id = ?')->execute([$user['id']]);

        $db->commit();
    } catch (Exception $e) {
        $db->rollBack();
        jsonError('Failed to delete account: ' . $e->getMessage(), 500);
    }

    session_destroy();
    jsonResponse(['success' => true]);
}
