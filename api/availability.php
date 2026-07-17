<?php
declare(strict_types=1);
// api/availability.php — get / save availability.
// Slots are stored in UTC (weekday/start_hour/end_hour all UTC-normalized).
// The client converts the user's local grid selection to UTC before saving,
// and converts back to local time for display — see js/timezone.js.
require_once __DIR__ . '/config.php';

header('Content-Type: application/json');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;
requireCsrf();

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'get':  handleGet();  break;
    case 'save': handleSave(); break;
    default:     jsonError('Unknown action', 404);
}

function handleGet(): void {
    $user = requireAuth();
    $stmt = db()->prepare(
        'SELECT weekday, start_hour, end_hour FROM availability WHERE user_id = ? ORDER BY weekday, start_hour'
    );
    $stmt->execute([$user['id']]);
    jsonResponse(['success' => true, 'slots' => $stmt->fetchAll()]);
}

function handleSave(): void {
    $user  = requireAuth();
    $body  = jsonBody();
    $slots = $body['slots'] ?? [];

    if (count($slots) > 500) jsonError('Too many slots in a single request');

    foreach ($slots as $s) {
        $wd = (int)($s['weekday'] ?? -1);
        $sh = (int)($s['start_hour'] ?? -1);
        $eh = (int)($s['end_hour'] ?? -1);
        if ($wd < 0 || $wd > 6 || $sh < 0 || $sh > 23 || $eh < 1 || $eh > 24 || $eh <= $sh) {
            jsonError('One or more time slots are invalid');
        }
    }

    $db = db();
    $db->beginTransaction();
    try {
        $db->prepare('DELETE FROM availability WHERE user_id = ?')->execute([$user['id']]);

        if (!empty($slots)) {
            $stmt = $db->prepare(
                'INSERT INTO availability (user_id, weekday, start_hour, end_hour) VALUES (?, ?, ?, ?)'
            );
            foreach ($slots as $s) {
                $stmt->execute([$user['id'], (int)$s['weekday'], (int)$s['start_hour'], (int)$s['end_hour']]);
            }
        }

        // Invalidate the overlap cache for every group this user belongs to
        // — their new availability affects every one of those groups' view.
        $groupIds = $db->prepare('SELECT group_id FROM group_members WHERE user_id = ?');
        $groupIds->execute([$user['id']]);
        $ids = array_column($groupIds->fetchAll(), 'group_id');
        if ($ids) {
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $db->prepare("DELETE FROM group_overlap_cache WHERE group_id IN ($placeholders)")->execute($ids);
        }

        $db->commit();
    } catch (Throwable $e) {
        $db->rollBack();
        jsonError('Failed to save availability. Please try again.', 500, $e->getMessage());
    }

    jsonResponse(['success' => true, 'saved' => count($slots)]);
}
