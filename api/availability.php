<?php
// api/availability.php — Handles: get my availability, save availability
require_once __DIR__ . '/config.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'get':
        handleGet();
        break;
    case 'save':
        handleSave();
        break;
    default:
        jsonError('Unknown action');
}

// GET: return current user's availability slots
function handleGet(): void {
    $user = requireAuth();
    $stmt = db()->prepare(
        'SELECT weekday, start_hour, end_hour FROM availability WHERE user_id = ? ORDER BY weekday, start_hour'
    );
    $stmt->execute([$user['id']]);
    $slots = $stmt->fetchAll();
    jsonResponse(['success' => true, 'slots' => $slots]);
}

// POST: replace all availability slots for current user
// Body: { slots: [ { weekday, start_hour, end_hour }, ... ] }
function handleSave(): void {
    $user = requireAuth();
    $body  = json_decode(file_get_contents('php://input'), true);
    $slots = $body['slots'] ?? [];

    // Validate
    foreach ($slots as $s) {
        $wd = (int)($s['weekday'] ?? -1);
        $sh = (int)($s['start_hour'] ?? -1);
        $eh = (int)($s['end_hour'] ?? -1);
        if ($wd < 0 || $wd > 6 || $sh < 6 || $sh > 22 || $eh < 7 || $eh > 23 || $eh <= $sh) {
            jsonError("Invalid slot: weekday=$wd, start=$sh, end=$eh");
        }
    }

    $db = db();
    $db->beginTransaction();
    try {
        // Delete old slots
        $db->prepare('DELETE FROM availability WHERE user_id = ?')->execute([$user['id']]);

        // Insert new slots
        if (!empty($slots)) {
            $stmt = $db->prepare(
                'INSERT INTO availability (user_id, weekday, start_hour, end_hour) VALUES (?, ?, ?, ?)'
            );
            foreach ($slots as $s) {
                $stmt->execute([$user['id'], (int)$s['weekday'], (int)$s['start_hour'], (int)$s['end_hour']]);
            }
        }
        $db->commit();
    } catch (Exception $e) {
        $db->rollBack();
        jsonError('Failed to save: ' . $e->getMessage(), 500);
    }

    jsonResponse(['success' => true, 'saved' => count($slots)]);
}
