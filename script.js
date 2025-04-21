const tg = window.Telegram.WebApp;
tg.expand();
tg.enableClosingConfirmation();

const supabaseUrl = 'https://koqnqotxchpimovxcnva.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtvcW5xb3R4Y2hwaW1vdnhjbnZhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NTE3Mzk4MCwiZXhwIjoyMDYwNzQ5OTgwfQ.bFAEslvrVDE2i7En3Ln8_AbQPtgvH_gElnrBcPBcSMc';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

const appState = {
  energy: 0,
  balance: 0,
  userId: tg.initDataUnsafe?.user?.id || null,
  currentTask: null
};

function updateUI() {
  document.getElementById("energy-bar").style.width = `${appState.energy}%`;
  document.getElementById("energy-percent").textContent = `${appState.energy}%`;
  document.getElementById("balance").textContent = appState.balance.toLocaleString();
  
  // Update user info if available
  if (tg.initDataUnsafe?.user) {
    const user = tg.initDataUnsafe.user;
    document.getElementById("username").textContent = user.first_name;
    document.getElementById("user-id").textContent = `ID: ${user.id}`;
    
    if (user.photo_url) {
      document.getElementById("user-avatar").src = user.photo_url;
    }
  }
}

async function updateEnergyInDB(newEnergy) {
  try {
    const { error } = await supabase
      .from('users')
      .update({ energy: newEnergy })
      .eq('user_id', appState.userId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error("Ошибка обновления энергии:", error);
    tg.showAlert("Ошибка сохранения энергии");
    return false;
  }
}

async function startTask(energyCost) {
  const newEnergy = appState.energy - energyCost;
  appState.energy = newEnergy;
  updateUI();
  
  const success = await updateEnergyInDB(newEnergy);
  
  if (success) {
    tg.showPopup({ 
      title: "Задание начато!", 
      message: `Списано ${energyCost}% энергии` 
    });
  } else {
    appState.energy += energyCost;
    updateUI();
  }
}

function showTaskDetails(task) {
  appState.currentTask = task;
  switchTab('task-details');
}

function showEnergyModal(requiredEnergy) {
  tg.HapticFeedback.impactOccurred('light');
  
  if (appState.energy < requiredEnergy) {
    document.getElementById("requiredEnergyText").textContent = 
      `Требуется ${requiredEnergy}% энергии. Пополнить сейчас?`;
    document.getElementById("energyModal").classList.add('active');
  } else {
    startTask(requiredEnergy);
  }
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

function switchTab(tabName) {
  // Update navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
  });
  
  if (tabName !== 'task-details') {
    document.querySelector(`.nav-item[onclick="switchTab('${tabName}')"]`).classList.add('active');
  }
  
  // Hide all pages
  document.querySelectorAll('.page').forEach(page => {
    page.classList.remove('active');
  });
  
  // Show selected page
  document.getElementById(`${tabName}-page`).classList.add('active');
}

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

function initApp() {
  updateUI();
  loadUserData();
  switchTab('home');

  // Set up global functions
  window.showEnergyModal = showEnergyModal;
  window.closeModal = closeModal;
  window.switchTab = switchTab;
  window.startTask = startTask;
  window.showTaskDetails = showTaskDetails;
}

document.addEventListener('DOMContentLoaded', initApp);