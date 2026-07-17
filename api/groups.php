<?php
declare(strict_types=1);
// api/groups.php — create, join, list, members, overlap, leave, delete, kick, transfer
require_once __DIR__ . '/config.php';

header('Content-Type: application/json');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;
requireCsrf();

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'create':    handleCreate();   break;
    case 'join':      handleJoin();     break;
    case 'list':      handleList();     break;
    case 'members':   handleMembers();  break;
    case 'overlap':   handleOverlap();  break;
    case 'leave':     handleLeave();    break;
    case 'delete':    handleDelete();   break;
    case 'kick':      handleKick();     break;
    case 'transfer':  handleTransfer(); break;
    default:          jsonError('Unknown action', 404);
}

function generateInviteCode(): string {
    // Avoid ambiguous characters (0/O, 1/I/L) so codes are easy to read aloud
    // or retype from memory.
    $alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    $code = '';
    for ($i = 0; $i < 8; $i++) {
        $code .= $alphabet[random_int(0, strlen($alphabet) - 1)];
    }
    return $code;
}

function requireMembership(PDO $db, int $groupId, int $userId): void {
    $chk = $db->prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?');
    $chk->execute([$groupId, $userId]);
    if (!$chk->fetch()) jsonError('Not a member of this group', 403);
}

function handleCreate(): void {
    $user = requireAuth();
    $body = jsonBody();
    $name = trim($body['name'] ?? '');
    if (!$name) jsonError('Group name is required');
    if (mb_strlen($name) > 100) jsonError('Group name is too long');

    $db   = db();
    $code = generateInviteCode();
    while (true) {
        $chk = $db->prepare('SELECT id FROM `groups` WHERE invite_code = ?');
        $chk->execute([$code]);
        if (!$chk->fetch()) break;
        $code = generateInviteCode();
    }

    $db->beginTransaction();
    try {
        $stmt = $db->prepare('INSERT INTO `groups` (name, invite_code, owner_id) VALUES (?, ?, ?)');
        $stmt->execute([$name, $code, $user['id']]);
        $groupId = (int)$db->lastInsertId();
        $db->prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)')->execute([$groupId, $user['id']]);
        $db->commit();
    } catch (Throwable $e) {
        $db->rollBack();
        jsonError('Failed to create group. Please try again.', 500, $e->getMessage());
    }

    jsonResponse(['success' => true, 'group' => ['id' => $groupId, 'name' => $name, 'invite_code' => $code]]);
}

function handleJoin(): void {
    $user = requireAuth();
    $body = jsonBody();
    $code = strtoupper(trim($body['invite_code'] ?? ''));
    if (!$code) jsonError('Invite code is required');

    $db   = db();
    $stmt = $db->prepare('SELECT id, name FROM `groups` WHERE invite_code = ?');
    $stmt->execute([$code]);
    $group = $stmt->fetch();
    if (!$group) jsonError('Invalid invite code');

    $chk = $db->prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?');
    $chk->execute([$group['id'], $user['id']]);
    if ($chk->fetch()) jsonError('You are already in this group');

    $db->prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)')->execute([$group['id'], $user['id']]);
    // A new member changes the overlap outcome — invalidate the cache.
    $db->prepare('DELETE FROM group_overlap_cache WHERE group_id = ?')->execute([$group['id']]);

    jsonResponse(['success' => true, 'group' => $group]);
}

function handleList(): void {
    $user = requireAuth();
    $stmt = db()->prepare(
        'SELECT g.id, g.name, g.invite_code, g.owner_id,
                (SELECT COUNT(*) FROM group_members gm2 WHERE gm2.group_id = g.id) AS member_count
         FROM `groups` g
         JOIN group_members gm ON gm.group_id = g.id
         WHERE gm.user_id = ?
         ORDER BY g.created_at DESC'
    );
    $stmt->execute([$user['id']]);
    jsonResponse(['success' => true, 'groups' => $stmt->fetchAll()]);
}

function handleMembers(): void {
    $user    = requireAuth();
    $groupId = (int)($_GET['group_id'] ?? 0);
    if (!$groupId) jsonError('group_id required');

    $db = db();
    requireMembership($db, $groupId, (int)$user['id']);

    $stmt = $db->prepare(
        'SELECT u.id, u.username, u.display_name FROM users u
         JOIN group_members gm ON gm.user_id = u.id
         WHERE gm.group_id = ?
         ORDER BY gm.joined_at ASC'
    );
    $stmt->execute([$groupId]);
    jsonResponse(['success' => true, 'members' => $stmt->fetchAll()]);
}

/**
 * Compute (or serve cached) overlapping availability for a group.
 * Cache is invalidated whenever membership changes or any member saves new
 * availability (see groups.php join/kick/leave and availability.php save).
 * This turns an O(members × slots) recomputation on every group view into a
 * single cache read for the common case of "nobody's changed anything".
 */
function handleOverlap(): void {
    $user    = requireAuth();
    $groupId = (int)($_GET['group_id'] ?? 0);
    if (!$groupId) jsonError('group_id required');

    $db = db();
    requireMembership($db, $groupId, (int)$user['id']);

    $cacheStmt = $db->prepare('SELECT overlap_json FROM group_overlap_cache WHERE group_id = ?');
    $cacheStmt->execute([$groupId]);
    $cached = $cacheStmt->fetch();
    if ($cached) {
        $decoded = json_decode($cached['overlap_json'], true);
        if (is_array($decoded)) {
            jsonResponse(array_merge(['success' => true], $decoded));
        }
    }

    $stmt = $db->prepare('SELECT user_id FROM group_members WHERE group_id = ?');
    $stmt->execute([$groupId]);
    $memberIds = array_column($stmt->fetchAll(), 'user_id');

    if (count($memberIds) < 2) {
        $payload = ['overlap' => [], 'message' => 'At least 2 members needed', 'total_members' => count($memberIds), 'members_with_data' => 0];
        jsonResponse(array_merge(['success' => true], $payload));
    }

    $grid = [];
    for ($w = 0; $w <= 6; $w++) {
        for ($h = 0; $h <= 23; $h++) $grid[$w][$h] = 0;
    }

    $placeholders = implode(',', array_fill(0, count($memberIds), '?'));
    $stmt = $db->prepare(
        "SELECT user_id, weekday, start_hour, end_hour FROM availability WHERE user_id IN ($placeholders)"
    );
    $stmt->execute($memberIds);
    $allSlots = $stmt->fetchAll();

    $usersWithData = [];
    foreach ($allSlots as $slot) {
        $usersWithData[$slot['user_id']] = true;
        for ($h = (int)$slot['start_hour']; $h < (int)$slot['end_hour']; $h++) {
            $grid[(int)$slot['weekday']][$h % 24]++;
        }
    }

    $total = count($memberIds);
    $overlap = [];
    for ($w = 0; $w <= 6; $w++) {
        $blockStart = null;
        for ($h = 0; $h <= 24; $h++) {
            $allFree = ($h <= 23) && $grid[$w][$h] === $total;
            if ($allFree && $blockStart === null) {
                $blockStart = $h;
            } elseif (!$allFree && $blockStart !== null) {
                $overlap[] = ['weekday' => $w, 'start_hour' => $blockStart, 'end_hour' => $h];
                $blockStart = null;
            }
        }
    }

    $payload = [
        'overlap'           => $overlap,
        'total_members'     => $total,
        'members_with_data' => count($usersWithData),
    ];

    $db->prepare(
        'INSERT INTO group_overlap_cache (group_id, overlap_json, computed_at) VALUES (?, ?, NOW())
         ON DUPLICATE KEY UPDATE overlap_json = VALUES(overlap_json), computed_at = NOW()'
    )->execute([$groupId, json_encode($payload)]);

    jsonResponse(array_merge(['success' => true], $payload));
}

function handleLeave(): void {
    $user    = requireAuth();
    $body    = jsonBody();
    $groupId = (int)($body['group_id'] ?? 0);
    if (!$groupId) jsonError('group_id required');

    $db   = db();
    $stmt = $db->prepare('SELECT owner_id FROM `groups` WHERE id = ?');
    $stmt->execute([$groupId]);
    $group = $stmt->fetch();
    if (!$group) jsonError('Group not found', 404);

    requireMembership($db, $groupId, (int)$user['id']);

    if ((int)$group['owner_id'] === (int)$user['id']) {
        $count = $db->prepare('SELECT COUNT(*) AS c FROM group_members WHERE group_id = ?');
        $count->execute([$groupId]);
        if ((int)$count->fetch()['c'] > 1) {
            jsonError('Transfer ownership to another member, or delete the group, before leaving.');
        }
        $db->prepare('DELETE FROM `groups` WHERE id = ?')->execute([$groupId]);
        jsonResponse(['success' => true, 'deleted' => true]);
        return;
    }

    $db->prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?')->execute([$groupId, $user['id']]);
    $db->prepare('DELETE FROM group_overlap_cache WHERE group_id = ?')->execute([$groupId]);
    jsonResponse(['success' => true, 'deleted' => false]);
}

function handleDelete(): void {
    $user    = requireAuth();
    $body    = jsonBody();
    $groupId = (int)($body['group_id'] ?? 0);
    if (!$groupId) jsonError('group_id required');

    $db   = db();
    $stmt = $db->prepare('SELECT owner_id FROM `groups` WHERE id = ?');
    $stmt->execute([$groupId]);
    $group = $stmt->fetch();
    if (!$group) jsonError('Group not found', 404);

    if ((int)$group['owner_id'] !== (int)$user['id']) {
        jsonError('Only the group creator can delete this group', 403);
    }

    $db->prepare('DELETE FROM `groups` WHERE id = ?')->execute([$groupId]);
    jsonResponse(['success' => true]);
}

function handleKick(): void {
    $user     = requireAuth();
    $body     = jsonBody();
    $groupId  = (int)($body['group_id'] ?? 0);
    $targetId = (int)($body['user_id'] ?? 0);
    if (!$groupId || !$targetId) jsonError('group_id and user_id required');

    $db   = db();
    $stmt = $db->prepare('SELECT owner_id FROM `groups` WHERE id = ?');
    $stmt->execute([$groupId]);
    $group = $stmt->fetch();
    if (!$group) jsonError('Group not found', 404);

    if ((int)$group['owner_id'] !== (int)$user['id']) {
        jsonError('Only the group creator can remove members', 403);
    }
    if ($targetId === (int)$user['id']) {
        jsonError('Use "Delete group" instead of removing yourself');
    }

    $chk = $db->prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?');
    $chk->execute([$groupId, $targetId]);
    if (!$chk->fetch()) jsonError('That person is not a member of this group');

    $db->prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?')->execute([$groupId, $targetId]);
    $db->prepare('DELETE FROM group_overlap_cache WHERE group_id = ?')->execute([$groupId]);
    jsonResponse(['success' => true]);
}

// New: let an owner hand off the group instead of being stuck choosing
// between "delete everything" or "wait for everyone else to leave".
function handleTransfer(): void {
    $user     = requireAuth();
    $body     = jsonBody();
    $groupId  = (int)($body['group_id'] ?? 0);
    $targetId = (int)($body['user_id'] ?? 0);
    if (!$groupId || !$targetId) jsonError('group_id and user_id required');

    $db   = db();
    $stmt = $db->prepare('SELECT owner_id FROM `groups` WHERE id = ?');
    $stmt->execute([$groupId]);
    $group = $stmt->fetch();
    if (!$group) jsonError('Group not found', 404);

    if ((int)$group['owner_id'] !== (int)$user['id']) {
        jsonError('Only the current owner can transfer this group', 403);
    }
    requireMembership($db, $groupId, $targetId);

    $db->prepare('UPDATE `groups` SET owner_id = ? WHERE id = ?')->execute([$targetId, $groupId]);
    jsonResponse(['success' => true]);
}
