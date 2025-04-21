
// Инициализация Telegram WebApp
const tg = window.Telegram.WebApp;
tg.expand();
tg.setBackgroundColor('#1a1a2e')



// Переключение вкладок
function switchTab(tabName) {
    // Скрываем все контейнеры
    document.getElementById('home-container').style.display = 'none';
    document.getElementById('tasks-container').style.display = 'none';
    document.getElementById('market-container').style.display = 'none';

    // Показываем выбранный контейнер
    document.getElementById(`${tabName}-container`).style.display = 'block';

    // Обновляем активную вкладку
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    event.currentTarget.classList.add('active');
}


// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById("username").textContent = tg.initDataUnsafe.user.first_name;
    document.getElementById("user_id").textContent = tg.initDataUnsafe.user.id;

    // По умолчанию показываем Home
    switchTab('home');
});




const API_URL = "https://3aa1-217-23-3-91.ngrok-free.app";

async function loadUserData() {
    const tgUser = window.Telegram.WebApp.initDataUnsafe.user;
    if (!tgUser) return;
    
    try {
        const response = await fetch(`${API_URL}/users/${tgUser.id}`);
        const data = await response.json();
        
        // Обновляем UI
        document.getElementById('energy-value').textContent = data.energy;
        document.getElementById('balance').textContent = data.cash;
    } catch (error) {
        console.error("Ошибка загрузки данных:", error);
    }
}

async function updateEnergy(value) {
    const tgUser = window.Telegram.WebApp.initDataUnsafe.user;
    if (!tgUser) return;
    
    try {
        await fetch(`${API_URL}/users/${tgUser.id}/update`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ energy: value })
        });
        loadUserData(); // Перезагружаем данные
    } catch (error) {
        console.error("Ошибка обновления:", error);
    }
}