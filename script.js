let tg = window.Telegram.WebApp;
tg.expand();
tg.setBackgroundColor('#1a1a2e');

// Инициализируем значения по умолчанию
let currentEnergy = 0;
let balance = 0;
let usdtBalance = 0;
let isLoading = true;

// Элементы UI
const energyBar = document.getElementById("energy-bar");
const energyPercent = document.getElementById("energy-percent");
const balanceElement = document.getElementById("balance");


async function fetchUserData() {
  try {
    // Показываем загрузчик
    loader.style.display = "block";
    content.style.display = "none";
    
    const userId = tg.initDataUnsafe.user.id;
    const response = await fetch(`http://ваш-бэкенд.ру/user/${userId}`);
    const data = await response.json();

    if (data.error) {
      throw new Error(data.error);
    }

    // Обновляем данные из ответа
    currentEnergy = data.energy || 0;
    balance = data.cash || 0;
    usdtBalance = data.usdt_balance || 0; // Добавьте это поле в вашу БД если нужно

    // Обновляем интерфейс
    updateUI();
    
  } catch (error) {
    console.error("Ошибка загрузки данных:", error);
    alert("Не удалось загрузить данные. Попробуйте позже.");
  } finally {
    // Скрываем загрузчик
    loader.style.display = "none";
    content.style.display = "block";
  }
}

function updateUI() {
  energyBar.style.width = `${currentEnergy}%`;
  energyPercent.textContent = `${currentEnergy}%`;
  balanceElement.textContent = balance.toLocaleString();
}

function showEnergyModal(requiredEnergy) {
  if (currentEnergy < requiredEnergy) {
    document.getElementById("requiredEnergyText").textContent = 
      `Требуется ${requiredEnergy}% энергии. Пополнить сейчас?`;
    document.getElementById("energyModal").style.display = "flex";
  } else {
    startTask(requiredEnergy);
  }
}

function closeModal(modalName) {
  document.getElementById(modalName).style.display = "none";
}

async function startTask(energyCost) {
  try {
    const userId = tg.initDataUnsafe.user.id;
    
    // Отправляем запрос на обновление энергии
    const response = await fetch(`http://ваш-бэкенд.ру/user/${userId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        energy: currentEnergy - energyCost
      })
    });

    const result = await response.json();
    
    if (result.error) {
      throw new Error(result.error);
    }

    // Обновляем локальные данные
    currentEnergy -= energyCost;
    updateUI();
    alert("Задание начато!");

  } catch (error) {
    console.error("Ошибка обновления энергии:", error);
    alert("Ошибка при запуске задания");
  }
}

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', async function() {
  document.getElementById("username").textContent = tg.initDataUnsafe.user.first_name;
  document.getElementById("user-id").textContent = tg.initDataUnsafe.user.id;

  // Загружаем данные пользователя
  await fetchUserData();
  
  // Инициализируем UI с загруженными данными
  updateUI();
});