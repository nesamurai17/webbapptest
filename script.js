let tg = window.Telegram.WebApp;
tg.expand();
tg.setBackgroundColor('#1a1a2e');



let currentEnergy = 30;
let balance = 1000000;
let usdtBalance = 100;

function updateUI() {
  const energyBar = document.getElementById("energy-bar");
  const energyPercent = document.getElementById("energy-percent");
  energyBar.style.width = `${currentEnergy}%`;
  energyPercent.textContent = `${currentEnergy}%`;
  document.getElementById("balance").textContent = balance.toLocaleString();
  document.getElementById("usdt-balance").textContent = usdtBalance.toFixed(2);
}

function showEnergyModal(requiredEnergy) {
  if (currentEnergy < requiredEnergy) {
    document.getElementById(
      "requiredEnergyText"
    ).textContent = `Требуется ${requiredEnergy}% энергии. Пополнить сейчас?`;
    document.getElementById("energyModal").style.display = "flex";
  } else {
    startTask(requiredEnergy);
  }
}

function buyWithCoins() {
  const cost = requiredEnergy * 10000;
  if (balance >= cost) {
    balance -= cost;
    currentEnergy = 100;
    closeModal();
    updateUI();
  } else {
    alert("Не достаточно коинов!");
  }
}

// document.getElementById('close-webapp-btn').addEventListener('click', function() {
//     // Проверяем, открыто ли в Telegram WebApp
//     if (window.Telegram && Telegram.WebApp) {
//       // Закрываем WebApp
//       Telegram.WebApp.close();
//     } else {
//       // Альтернативное поведение для других браузеров
//       window.history.back();
//       // Или можно показать сообщение
//       alert("Эта функция работает только в Telegram");
//     }
//   });

function closeModal(){
  document.getElementById("energyModal").style.display = "none";
}

function startTask(energyCost) {
  currentEnergy -= energyCost;
  updateUI();
  alert("Task started!");
}

// document.addEventListener("DOMContentLoaded", updateUI);
// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', function() {
  document.getElementById("username").textContent = tg.initDataUnsafe.user.first_name;
  document.getElementById("user-id").textContent = tg.initDataUnsafe.user.id;


  // По умолчанию показываем Home
  // switchTab('home');
});
