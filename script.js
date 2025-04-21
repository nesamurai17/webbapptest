// 1. Инициализация Telegram WebApp
const tg = window.Telegram.WebApp;
tg.expand();
tg.enableClosingConfirmation();

// 2. Инициализация Supabase
const supabaseUrl = 'https://koqnqotxchpimovxcnva.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtvcW5xb3R4Y2hwaW1vdnhjbnZhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NTE3Mzk4MCwiZXhwIjoyMDYwNzQ5OTgwfQ.bFAEslvrVDE2i7En3Ln8_AbQPtgvH_gElnrBcPBcSMc';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// 3. Состояние приложения
const appState = {
  energy: 0,
  balance: 0,
  userId: tg.initDataUnsafe?.user?.id || null
};

// 4. Функции работы с UI
function updateUI() {
  document.getElementById("energy-bar").style.width = `${appState.energy}%`;
  document.getElementById("energy-percent").textContent = `${appState.energy}%`;
  document.getElementById("balance").textContent = appState.balance.toLocaleString();
}

// 5. Функции для кнопок (без изменения HTML)
function showEnergyModal(requiredEnergy) {
  tg.HapticFeedback.impactOccurred('light');
  
  if (appState.energy < requiredEnergy) {
    document.getElementById("requiredEnergyText").textContent = 
      `Требуется ${requiredEnergy}% энергии. Пополнить сейчас?`;
    document.getElementById("energyModal").style.display = "flex";
  } else {
    startTask(requiredEnergy);
  }
}

function closeModal(modalId) {
  document.getElementById(modalId).style.display = "none";
}

function startTask(energyCost) {
  appState.energy -= energyCost;
  updateUI();
  tg.showPopup({ 
    title: "Задание начато!", 
    message: `Списано ${energyCost}% энергии` 
  });
}

function switchTab(tabName) {
  ['home', 'tasks', 'market'].forEach(tab => {
    document.getElementById(`${tab}-container`).style.display = 'none';
  });
  document.getElementById(`${tabName}-container`).style.display = 'block';
}

// 6. Загрузка данных пользователя
async function loadUserData() {
  if (!appState.userId) return;
  
  try {
    const { data } = await supabase
      .from('users')
      .select('energy, cash')
      .eq('user_id', appState.userId)
      .single();

    if (data) {
      appState.energy = data.energy;
      appState.balance = data.cash;
      updateUI();
    }
  } catch (error) {
    console.error("Ошибка загрузки данных:", error);
    tg.showAlert("Ошибка загрузки данных");
  }
}

// 7. Инициализация приложения
function initApp() {
  // Установка данных пользователя
  if (tg.initDataUnsafe?.user) {
    document.getElementById("username").textContent = tg.initDataUnsafe.user.first_name;
    document.getElementById("user-id").textContent = `ID: ${appState.userId}`;
  }

  // Загрузка данных
  loadUserData();

  // Восстановление стандартных обработчиков
  window.showEnergyModal = showEnergyModal;
  window.closeModal = closeModal;
  window.switchTab = switchTab;
}

// Запуск приложения
document.addEventListener('DOMContentLoaded', initApp);