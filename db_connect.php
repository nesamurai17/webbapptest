<?php
$host = 'localhost';
$dbname = 'pisare3h_avva'; // Замените на реальное имя БД
$user = 'pisare3h_avva';    // Логин от Beget MySQL
$pass = 'AVVA_pidor1';   // Пароль от Beget MySQL

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    die(json_encode(['error' => 'Database connection failed']));
}
?>