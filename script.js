let tg = window.Telegram.WebApp;
tg.expand();
tg.setBackgroundColor('#1a1a2e');

// Инициализация Supabase
const supabaseUrl = 'https://koqnqotxchpimovxcnva.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtvcW5xb3R4Y2hwaW1vdnhjbnZhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NTE3Mzk4MCwiZXhwIjoyMDYwNzQ5OTgwfQ.bFAEslvrVDE2i7En3Ln8_AbQPtgvH_gElnrBcPBcSMc';
const supabase = supabase.createClient(supabaseUrl, supabaseKey);

let currentEnergy = 0; // Будет обновлено из БД
let balance = 0;       // Будет обновлено из БД

// Загрузка данных пользователя
async function fetchUserData() {
  const userId = tg.initDataUnsafe.user.id;
  
  const { data, error } = await supabase
    .from('users')
    .select('energy, cash')
    .eq('user_id', userId)
    .single(); // Получаем одну запись

  if (error) {
    console.error('Ошибка загрузки данных:', error);
    return;
  }

  if (data) {
    currentEnergy = data.energy;
    balance = data.cash;
    updateUI();
  }
}



// Обновление интерфейса
function updateUI() {
  const energyBar = document.getElementById("energy-bar");
  const energyPercent = document.getElementById("energy-percent");
  energyBar.style.width = `${currentEnergy}%`;
  energyPercent.textContent = `${currentEnergy}%`;
  document.getElementById("balance").textContent = balance.toLocaleString();
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



// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', function() {
  document.getElementById("username").textContent = tg.initDataUnsafe.user.first_name;
  document.getElementById("user-id").textContent = tg.initDataUnsafe.user.id;
  
  fetchUserData(); // Загружаем данные из БД
});