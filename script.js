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

function closeModal(modalname){
  document.getElementById(`${modalname}`).style.display = "none";
}

function startTask(energyCost) {
  currentEnergy -= energyCost;
  updateUI();
  alert("Task started!");
}



function switchTab(tabName) {
  // Скрываем все контейнеры
  document.getElementById('home-container').style.display = 'none';
  document.getElementById('tasks-container').style.display = 'none';
  document.getElementById('market-container').style.display = 'none';

  // Показываем выбранный контейнер
  document.getElementById(`${tabName}-container`).style.display = 'block';

  // Обновляем активную вкладку
  document.querySelectorAll('.nav-item').forEach(tab => {
      tab.classList.remove('active');
  });
  event.currentTarget.classList.add('active');
}



// document.addEventListener("DOMContentLoaded", updateUI);
// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', function() {
  document.getElementById("username").textContent = tg.initDataUnsafe.user.first_name;
  document.getElementById("user-id").textContent = tg.initDataUnsafe.user.id;
  // По умолчанию показываем Home
  switchTab('home');
});