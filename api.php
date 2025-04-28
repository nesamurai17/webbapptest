<?php
header('Content-Type: application/json');
require 'db_connect.php';

// Получаем данные из POST-запроса
$action = $_POST['action'] ?? '';
$userId = $_POST['user_id'] ?? 0;

try {
    switch ($action) {
        case 'get_user_data':
            $stmt = $pdo->prepare("SELECT cash, wallet_address FROM users WHERE user_id = ?");
            $stmt->execute([$userId]);
            echo json_encode($stmt->fetch(PDO::FETCH_ASSOC) ?: ['cash' => 0, 'wallet_address' => '']);
            break;

        case 'get_all_tasks':
            $stmt = $pdo->query("SELECT * FROM tasks");
            echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
            break;

        case 'update_balance':
            $cash = (float)$_POST['cash'];
            $stmt = $pdo->prepare("UPDATE users SET cash = ? WHERE user_id = ?");
            $stmt->execute([$cash, $userId]);
            echo json_encode(['success' => true]);
            break;

        default:
            throw new Exception('Unknown action');
    }
} catch (Exception $e) {
    echo json_encode(['error' => $e->getMessage()]);
}