<?php
// api/groups.php — Handles: create, join, list, members, overlap
require_once __DIR__ . '/config.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'create':   handleCreate();  break;
    case 'join':     handleJoin();    break;
    case 'list':     handleList();    break;
    case 'members':  handleMembers(); break;
    case 'overlap':  handleOverlap(); break;
    default:         jsonError('Unknown action');
}

// Create a new group
function handleCreate(): void {
    $user = requireAuth();
    $body = json_decode(file_get_contents('php://input'), true);
    $name = trim($body['name'] ?? '');
    if (!$name) jsonError('Group name is required');

    $db   = db();
    $code = generateInviteCode();
    // Ensure unique code
    while (true) {
        $chk = $db->prepare('SELECT id FROM groups WHERE invite_code = ?');
        $chk->execute([$code]);
        if (!$chk->fetch()) break;
        $code = generateInviteCode();
    }

    $stmt = $db->prepare('INSERT INTO `groups` (name, invite_code, owner_id) VALUES (?, ?, ?)');
    $stmt->execute([$name, $code, $user['id']]);
    $groupId = (int)$db->lastInsertId();

    // Auto-join creator
    $db->prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)')->execute([$groupId, $user['id']]);

    jsonResponse(['success' => true, 'group' => ['id' => $groupId, 'name' => $name, 'invite_code' => $code]]);
}

// Join a group by invite code
function handleJoin(): void {
    $user = requireAuth();
    $body = json_decode(file_get_contents('php://input'), true);
    $code = strtoupper(trim($body['invite_code'] ?? ''));
    if (!$code) jsonError('Invite code is required');

    $db   = db();
    $stmt = $db->prepare('SELECT id, name FROM `groups` WHERE invite_code = ?');
    $stmt->execute([$code]);
    $group = $stmt->fetch();
    if (!$group) jsonError('Invalid invite code');

    // Check already a member
    $chk = $db->prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?');
    $chk->execute([$group['id'], $user['id']]);
    if ($chk->fetch()) jsonError('You are already in this group');

    $db->prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)')->execute([$group['id'], $user['id']]);

    jsonResponse(['success' => true, 'group' => $group]);
}

// List all groups the current user belongs to
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

// List members of a group (only if current user is in it)
function handleMembers(): void {
    $user    = requireAuth();
    $groupId = (int)($_GET['group_id'] ?? 0);
    if (!$groupId) jsonError('group_id required');

    $db = db();
    // Check membership
    $chk = $db->prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?');
    $chk->execute([$groupId, $user['id']]);
    if (!$chk->fetch()) jsonError('Not a member of this group', 403);

    $stmt = $db->prepare(
        'SELECT u.id, u.username, u.display_name FROM users u
         JOIN group_members gm ON gm.user_id = u.id
         WHERE gm.group_id = ?'
    );
    $stmt->execute([$groupId]);
    jsonResponse(['success' => true, 'members' => $stmt->fetchAll()]);
}

// Compute overlapping availability for all members of a group
function handleOverlap(): void {
    $user    = requireAuth();
    $groupId = (int)($_GET['group_id'] ?? 0);
    if (!$groupId) jsonError('group_id required');

    $db = db();
    // Check membership
    $chk = $db->prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?');
    $chk->execute([$groupId, $user['id']]);
    if (!$chk->fetch()) jsonError('Not a member of this group', 403);

    // Get all member IDs
    $stmt = $db->prepare('SELECT user_id FROM group_members WHERE group_id = ?');
    $stmt->execute([$groupId]);
    $memberIds = array_column($stmt->fetchAll(), 'user_id');

    if (count($memberIds) < 2) {
        jsonResponse(['success' => true, 'overlap' => [], 'message' => 'At least 2 members needed']);
        return;
    }

    // Build an hour grid: [weekday][hour] = count of members free during that hour
    // A member is "free" during hour H on weekday W if they have a slot covering H to H+1
    $grid = [];
    for ($w = 0; $w <= 6; $w++) {
        for ($h = 6; $h <= 22; $h++) {
            $grid[$w][$h] = 0;
        }
    }

    // Get all availability for all members
    $placeholders = implode(',', array_fill(0, count($memberIds), '?'));
    $stmt = $db->prepare(
        "SELECT user_id, weekday, start_hour, end_hour
         FROM availability
         WHERE user_id IN ($placeholders)"
    );
    $stmt->execute($memberIds);
    $allSlots = $stmt->fetchAll();

    // Track which users have submitted availability
    $usersWithData = [];
    foreach ($allSlots as $slot) {
        $usersWithData[$slot['user_id']] = true;
        for ($h = (int)$slot['start_hour']; $h < (int)$slot['end_hour']; $h++) {
            if ($h >= 6 && $h <= 22) {
                $grid[(int)$slot['weekday']][$h]++;
            }
        }
    }

    $total = count($memberIds);

    // Find contiguous blocks where ALL members are free
    $overlap = [];
    for ($w = 0; $w <= 6; $w++) {
        $blockStart = null;
        for ($h = 6; $h <= 23; $h++) {
            $allFree = ($h <= 22) && isset($grid[$w][$h]) && $grid[$w][$h] === $total;
            if ($allFree && $blockStart === null) {
                $blockStart = $h;
            } elseif (!$allFree && $blockStart !== null) {
                $overlap[] = ['weekday' => $w, 'start_hour' => $blockStart, 'end_hour' => $h];
                $blockStart = null;
            }
        }
    }

    jsonResponse([
        'success'           => true,
        'overlap'           => $overlap,
        'total_members'     => $total,
        'members_with_data' => count($usersWithData),
    ]);
}
