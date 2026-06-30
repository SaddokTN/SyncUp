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
        'user' => ['id' => $userId, 'username' => $username, 'display_name' => $display_name]
    ]);
}

function handleLogin(): void {
    $body     = json_decode(file_get_contents('php://input'), true);
    $username = trim($body['username'] ?? '');
    $password = $body['password'] ?? '';

    if (!$username || !$password) jsonError('Username and password required');

    $stmt = db()->prepare('SELECT id, username, display_name, password_hash FROM users WHERE username = ?');
    $stmt->execute([$username]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password_hash'])) {
        jsonError('Invalid username or password', 401);
    }

    $_SESSION['user_id']  = $user['id'];
    $_SESSION['username'] = $user['username'];

    jsonResponse([
        'success' => true,
        'user' => ['id' => $user['id'], 'username' => $user['username'], 'display_name' => $user['display_name']]
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
