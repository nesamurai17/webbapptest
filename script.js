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
  currentTask: null,
  teams: [],
  tasks: [], // Добавляем массив для хранения заданий
  ratings: {
    cash: [],
    tasks: [],
    invites: []
  }
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

async function initUserTasks() {
  if (!appState.userId) {
    console.error("User ID not available");
    return false;
  }

  const tableName = `tasks_of_${appState.userId}`;
  console.log(`Attempting to init table: ${tableName}`);

  try {
    // Простая проверка существования таблицы
    const { error: checkError } = await supabase
      .from(tableName)
      .select('*')
      .limit(1);

    // Если таблица не существует (код ошибки 42P01)
    if (checkError && checkError.code === '42P01') {
      console.log(`Table ${tableName} doesn't exist, creating...`);
      
      // Создаем таблицу через обычный запрос (без RPC)
      const { error: createError } = await supabase
        .from(tableName)
        .insert([{ 
          task: 'temp', 
          access: 0, 
          completed: 0 
        }], { returning: 'minimal' });
      
      if (createError) throw createError;
      
      // Удаляем временную запись
      await supabase
        .from(tableName)
        .delete()
        .eq('task', 'temp');
    }

    // Синхронизируем задания
    await syncUserTasks(tableName);
    return true;
  } catch (error) {
    console.error("Ошибка инициализации заданий:", error);
    tg.showAlert("Ошибка инициализации заданий: " + error.message);
    return false;
  }
}

async function syncUserTasks(tableName) {
  try {
    // Получаем все задания из основной таблицы
    const { data: allTasks, error: tasksError } = await supabase
      .from('tasks')
      .select('task_id');

    if (tasksError) throw tasksError;
    if (!allTasks || allTasks.length === 0) return true;

    // Получаем текущие задания пользователя
    const { data: userTasks, error: userTasksError } = await supabase
      .from(tableName)
      .select('task');

    if (userTasksError) throw userTasksError;

    // Находим новые задания для добавления
    const existingTasks = userTasks?.map(t => t.task) || [];
    const tasksToAdd = allTasks
      .filter(t => !existingTasks.includes(t.task_id))
      .map(t => ({
        task: t.task_id,
        access: 0,
        completed: 0
      }));

    if (tasksToAdd.length > 0) {
      const { error: insertError } = await supabase
        .from(tableName)
        .insert(tasksToAdd);

      if (insertError) throw insertError;
      console.log(`Added ${tasksToAdd.length} tasks to ${tableName}`);
    }

    return true;
  } catch (error) {
    console.error("Ошибка синхронизации заданий:", error);
    throw error;
  }
}

async function loadTasks() {
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('task_id', { ascending: true });

    if (error) throw error;
    
    if (data) {
      // Группируем задания по блокам и собираем общую информацию
      const groupedTasks = {};
      data.forEach(task => {
        const [blockId] = task.task_id.split('-');
        if (!groupedTasks[blockId]) {
          groupedTasks[blockId] = {
            price: task.price, // Стоимость блока
            reward: task.reward, // Награда за блок
            tasks: [] // Задания в блоке
          };
        }
        // Добавляем все поля задания, включая text
        groupedTasks[blockId].tasks.push({
          name: task.name,
          text: task.text,
          // Можно добавить другие нужные поля
        });
      });
      
      appState.tasks = Object.values(groupedTasks);
      renderTasks();
    }
  } catch (error) {
    console.error("Ошибка загрузки заданий:", error);
    tg.showAlert("Ошибка загрузки списка заданий");
  }
}

function renderTasks() {
  const tasksContainer = document.getElementById('tasks-page');
  if (!tasksContainer) return;

  // Очищаем существующие карточки (кроме header)
  const existingCards = tasksContainer.querySelectorAll('.task-card');
  existingCards.forEach(card => card.remove());

  // Создаем карточки для каждого блока заданий
  appState.tasks.forEach((taskBlock, blockIndex) => {
    const blockCard = document.createElement('div');
    blockCard.className = 'card task-card';
    
    // Заголовок блока
    blockCard.innerHTML = `
      <div class="card-title">
        <i class="fas fa-star"></i>
        Блок заданий #${blockIndex + 1}
      </div>
      <div class="badge badge-primary">
        <i class="fas fa-bolt"></i> Стоимость: ${taskBlock.price} энергии
      </div>
      <div class="badge badge-premium" style="margin-top: 0.5rem;">
        <i class="fas fa-gem"></i> Награда: ${taskBlock.reward} очков
      </div>
      <p class="card-description">
        Выполните все задания блока для получения награды
      </p>
      <div class="task-steps">
    `;

    // Добавляем задания в блок
    const taskSteps = blockCard.querySelector('.task-steps');
    taskBlock.tasks.forEach((task, taskIndex) => {
      const taskStep = document.createElement('div');
      taskStep.className = 'task-step';
      taskStep.innerHTML = `
        <div class="step-number">${taskIndex + 1}</div>
        <div class="step-content">
          <div class="step-title">${task.name || `Шаг ${taskIndex + 1}`}</div>
          <div class="step-description">${task.text || 'Описание задания'}</div>
        </div>
      `;
      taskSteps.appendChild(taskStep);
    });

    // Кнопка начала выполнения
    const startButton = document.createElement('button');
    startButton.className = 'btn btn-primary';
    startButton.innerHTML = '<i class="fas fa-play"></i> Начать';
    startButton.onclick = () => showEnergyModal(taskBlock.price);
    
    blockCard.appendChild(startButton);
    tasksContainer.appendChild(blockCard);
  });
}

async function loadTeams() {
  try {
    const { data, error } = await supabase
      .from('teams')
      .select('team_id, score')
      .order('score', { ascending: false }); // Сортируем по score

    if (error) throw error;
    
    if (data) {
      appState.teams = data;
      renderTeams();
    }
  } catch (error) {
    console.error("Ошибка загрузки команд:", error);
    tg.showAlert("Ошибка загрузки списка команд");
  }
}

function renderTeams() {
  const teamsContainer = document.getElementById('teams-page');
  if (!teamsContainer) return;

  // Очищаем существующие карточки (кроме header)
  const existingCards = teamsContainer.querySelectorAll('.card');
  existingCards.forEach(card => card.remove());

  // Создаем карточки для каждой команды
  appState.teams.forEach((team, index) => {
    const teamCard = document.createElement('div');
    teamCard.className = 'card';
    
    // Определяем иконку и бейдж в зависимости от позиции в рейтинге
    const isTopTeam = index < 3; // Топ-3 команды
    const badgeText = isTopTeam ? `Топ ${index + 1}` : `Очки: ${team.score}`;
    
    teamCard.innerHTML = `
      <div class="card-title">
        <i class="fas ${isTopTeam ? 'fa-crown' : 'fa-users'}"></i>
        Команда #${team.team_id}
      </div>
      <div class="badge ${isTopTeam ? 'badge-premium' : 'badge-primary'}">
        ${badgeText}
      </div>
      <p class="card-description">
        ${isTopTeam ? 'Лидер рейтинга' : 'Присоединяйтесь и зарабатывайте очки'}
      </p>
      
    `;
    
    teamsContainer.appendChild(teamCard);
  });
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

async function loadAllRatings() {
  try {
    // Загружаем рейтинг по балансу (cash) с именами
    const { data: cashData } = await supabase
      .from('users')
      .select('user_id, cash, name') // Добавляем поле name
      .order('cash', { ascending: false })
      .limit(10);
    
    // Загружаем рейтинг по заданиям (countoftasks) с именами
    const { data: tasksData } = await supabase
      .from('users')
      .select('user_id, countoftasks, name') // Добавляем поле name
      .order('countoftasks', { ascending: false })
      .limit(10);
    
    // Пока оставляем рейтинг по инвайтам пустым
    const invitesData = [];
    
    if (cashData) appState.ratings.cash = cashData;
    if (tasksData) appState.ratings.tasks = tasksData;
    appState.ratings.invites = invitesData;
    
    renderAllRatings();
  } catch (error) {
    console.error("Ошибка загрузки рейтингов:", error);
    tg.showAlert("Ошибка загрузки рейтингов");
  }
}

function renderRatingList(elementId, data, valueField) {
  const container = document.getElementById(elementId);
  if (!container) return;
  
  container.innerHTML = '';
  
  if (data.length === 0) {
    container.innerHTML = '<div class="loading">Нет данных</div>';
    return;
  }
  
  data.forEach((user, index) => {
    const item = document.createElement('div');
    item.className = 'rating-item';
    
    // Используем user.name или показываем "Аноним", если имя отсутствует
    const userName = user.name || `Игрок ${user.user_id.slice(0, 4)}`;
    
    item.innerHTML = `
      <div class="rating-position">${index + 1}</div>
      <div class="rating-user" title="${userName}">${userName}</div>
      <div class="rating-value">${user[valueField] || 0}</div>
    `;
    
    container.appendChild(item);
  });
}

// Функция для отрисовки всех рейтингов
function renderAllRatings() {
  renderRatingList('cash-rating', appState.ratings.cash, 'cash');
  renderRatingList('tasks-rating', appState.ratings.tasks, 'countoftasks');
  renderRatingList('invites-rating', appState.ratings.invites, 'invites');
}





async function initApp() {
  try {
    updateUI();
    await loadUserData();
    
    // Добавляем задержку для инициализации
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Инициализация таблицы заданий
    const tasksInitialized = await initUserTasks();
    if (!tasksInitialized) {
      throw new Error("Не удалось инициализировать задания");
    }
    
    await loadTeams();
    await loadTasks();
    await loadAllRatings();
    
    switchTab('home');
    
    // Инициализация глобальных функций
    window.showEnergyModal = showEnergyModal;
    window.closeModal = closeModal;
    window.switchTab = switchTab;
    window.startTask = startTask;
    window.showTaskDetails = showTaskDetails;
    
  } catch (error) {
    console.error("Ошибка инициализации приложения:", error);
    tg.showAlert("Ошибка загрузки приложения: " + error.message);
  }
}
document.addEventListener('DOMContentLoaded', initApp);