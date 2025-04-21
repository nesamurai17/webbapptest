// Инициализация Telegram WebApp
const tg = window.Telegram.WebApp;
tg.expand();
tg.enableClosingConfirmation();

// Конфигурация Supabase
const supabaseUrl = 'https://koqnqotxchpimovxcnva.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtvcW5xb3R4Y2hwaW1vdnhjbnZhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NTE3Mzk4MCwiZXhwIjoyMDYwNzQ5OTgwfQ.bFAEslvrVDE2i7En3Ln8_AbQPtgvH_gElnrBcPBcSMc';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// Состояние приложения
let currentEnergy = 0;
let balance = 0;
let userId = null;

// DOM элементы
const elements = {
  username: document.getElementById("username"),
  userId: document.getElementById("user-id"),
  energyBar: document.getElementById("energy-bar"),
  energyPercent: document.getElementById("energy-percent"),
  balance: document.getElementById("balance"),
  energyModal: document.getElementById("energyModal"),
  requiredEnergyText: document.getElementById("requiredEnergyText"),
  homeContainer: document.getElementById("home-container"),
  tasksContainer: document.getElementById("tasks-container"),
  marketContainer: document.getElementById("market-container")
};

// Основные функции
async function fetchUserData() {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('energy, cash')
      .eq('user_id', userId)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Ошибка загрузки данных:", error);
    tg.showAlert("Ошибка загрузки данных");
    return null;
  }
}

function updateUI() {
  elements.energyBar.style.width = `${currentEnergy}%`;
  elements.energyPercent.textContent = `${currentEnergy}%`;
  elements.balance.textContent = balance.toLocaleString();
}

function showEnergyModal(requiredEnergy) {
  tg.HapticFeedback.impactOccurred('light');
  
  if (currentEnergy < requiredEnergy) {
    elements.requiredEnergyText.textContent = 
      `Требуется ${requiredEnergy}% энергии. Пополнить сейчас?`;
    elements.energyModal.style.display = "flex";
  } else {
    startTask(requiredEnergy);
  }
}

function closeModal(modalId) {
  document.getElementById(modalId).style.display = "none";
}

function startTask(energyCost) {
  currentEnergy -= energyCost;
  updateUI();
  tg.showPopup({ 
    title: "Задание начато!", 
    message: `Списано ${energyCost}% энергии` 
  });
}

function switchTab(tabName) {
  elements.homeContainer.style.display = 'none';
  elements.tasksContainer.style.display = 'none';
  elements.marketContainer.style.display = 'none';
  
  document.getElementById(`${tabName}-container`).style.display = 'block';
}

// Инициализация приложения
async function initApp() {
  try {
    // Получаем данные пользователя из Telegram
    userId = tg.initDataUnsafe?.user?.id;
    if (!userId) throw new Error("Не удалось получить ID пользователя");

    // Устанавливаем данные пользователя
    elements.username.textContent = tg.initDataUnsafe.user.first_name || "Гость";
    elements.userId.textContent = `ID: ${userId}`;

    // Загружаем данные из Supabase
    const userData = await fetchUserData();
    if (userData) {
      currentEnergy = userData.energy;
      balance = userData.cash;
      updateUI();
    }

    // Назначаем обработчики событий
    document.querySelectorAll('.btn[onclick*="showEnergyModal"]').forEach(btn => {
      const energyCost = parseInt(btn.getAttribute('onclick').match(/\d+/)[0]);
      btn.onclick = () => showEnergyModal(energyCost);
    });

    document.querySelectorAll('.nav-item').forEach(item => {
      const tab = item.getAttribute('onclick').match(/'(\w+)'/)[1];
      item.onclick = () => switchTab(tab);
    });

    document.querySelectorAll('[onclick*="closeModal"]').forEach(btn => {
      const modalId = btn.getAttribute('onclick').match(/'(\w+)'/)[1];
      btn.onclick = () => closeModal(modalId);
    });

    console.log("Приложение успешно инициализировано");
  } catch (error) {
    console.error("Ошибка инициализации:", error);
    tg.showAlert(`Ошибка: ${error.message}`);
  }
}

// Запускаем приложение после загрузки DOM
document.addEventListener('DOMContentLoaded', initApp);