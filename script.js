// ====================== ИНИЦИАЛИЗАЦИЯ ======================
const tg = window.Telegram.WebApp;
tg.expand(); // Раскрываем WebApp на весь экран
tg.enableClosingConfirmation(); // Подтверждение закрытия

// Сущности приложения
let currentEnergy = 0;
let balance = 0;
let supabase;

// ====================== ОСНОВНЫЕ ФУНКЦИИ ======================
// Инициализация Supabase (асинхронная)
async function initSupabase() {
  const { createClient } = await import('https://unpkg.com/@supabase/supabase-js@2');
  return createClient(
    'https://koqnqotxchpimovxcnva.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtvcW5xb3R4Y2hwaW1vdnhjbnZhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NTE3Mzk4MCwiZXhwIjoyMDYwNzQ5OTgwfQ.bFAEslvrVDE2i7En3Ln8_AbQPtgvH_gElnrBcPBcSMc'
  );
}

// Загрузка данных пользователя
async function fetchUserData(userId) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('energy, cash')
      .eq('user_id', userId)
      .single();

    if (error) throw error;
    return data || { energy: 100, cash: 1000 }; // Дефолтные значения
  } catch (error) {
    console.error("Ошибка загрузки:", error);
    tg.showAlert("Ошибка загрузки данных");
    return { energy: 100, cash: 1000 };
  }
}

// Обновление интерфейса
function updateUI() {
  document.getElementById("energy-bar").style.width = `${currentEnergy}%`;
  document.getElementById("energy-percent").textContent = `${currentEnergy}%`;
  document.getElementById("balance").textContent = balance.toLocaleString();
}

// Модальное окно энергии
function showEnergyModal(requiredEnergy) {
  tg.HapticFeedback.impactOccurred('light');
  
  if (currentEnergy < requiredEnergy) {
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
  currentEnergy -= energyCost;
  updateUI();
  tg.showPopup({ title: "Задание начато!", message: `Спишется ${energyCost}% энергии` });
}

// Переключение вкладок
function switchTab(tabName) {
  ['home', 'tasks', 'market'].forEach(tab => {
    document.getElementById(`${tab}-container`).style.display = 'none';
  });
  document.getElementById(`${tabName}-container`).style.display = 'block';
}

// ====================== ОБРАБОТЧИКИ СОБЫТИЙ ======================
function setupEventListeners() {
  // Кнопки заданий
  document.querySelectorAll('.btn[onclick*="showEnergyModal"]').forEach(btn => {
    const energyCost = parseInt(btn.getAttribute('onclick').match(/\d+/)[0]);
    btn.onclick = () => showEnergyModal(energyCost);
  });

  // Нижнее меню
  document.querySelectorAll('.nav-item').forEach(item => {
    const tab = item.getAttribute('onclick').match(/'(\w+)'/)[1];
    item.onclick = () => switchTab(tab);
  });

  // Модальные окна
  document.querySelectorAll('[onclick*="closeModal"]').forEach(btn => {
    const modalId = btn.getAttribute('onclick').match(/'(\w+)'/)[1];
    btn.onclick = () => closeModal(modalId);
  });
}

// ====================== ЗАПУСК ПРИЛОЖЕНИЯ ======================
async function initApp() {
  try {
    // 1. Инициализируем Supabase
    supabase = await initSupabase();
    
    // 2. Получаем данные пользователя
    const userId = tg.initDataUnsafe?.user?.id;
    if (!userId) throw new Error("Не получен user_id");
    
    document.getElementById("username").textContent = tg.initDataUnsafe.user.first_name;
    document.getElementById("user-id").textContent = `ID: ${userId}`;

    // 3. Загружаем данные из БД
    const userData = await fetchUserData(userId);
    currentEnergy = userData.energy;
    balance = userData.cash;
    updateUI();

    // 4. Активируем кнопки
    setupEventListeners();

    // 5. Режим отладки
    console.log("Приложение инициализировано!");
    window.supabase = supabase; // Доступ в консоли

  } catch (error) {
    console.error("Fatal error:", error);
    tg.showAlert(`Ошибка инициализации: ${error.message}`);
  }
}

// Запускаем приложение после загрузки DOM
document.addEventListener('DOMContentLoaded', initApp);