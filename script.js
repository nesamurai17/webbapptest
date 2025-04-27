const tg = window.Telegram.WebApp;
tg.expand();
tg.enableClosingConfirmation();

const supabaseUrl = 'https://koqnqotxchpimovxcnva.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtvcW5xb3R4Y2hwaW1vdnhjbnZhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NTE3Mzk4MCwiZXhwIjoyMDYwNzQ5OTgwfQ.bFAEslvrVDE2i7En3Ln8_AbQPtgvH_gElnrBcPBcSMc';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

const appState = {
  balance: 0,
  userId: tg.initDataUnsafe?.user?.id || null,
  currentTask: null,
  teams: [],
  tasks: [],
  userTasks: [],
  ratings: {
    cash: [],
    tasks: [],
    invites: []
  }
};

function updateUI() {
  document.getElementById("balance").textContent = appState.balance.toLocaleString();
  
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

  try {
    const { error: tasksError } = await supabase
      .from('tasks')
      .select('*')
      .limit(1);
    
    if (tasksError) throw new Error("Таблица tasks не найдена");

    await syncUserTasks();
    return true;
    
  } catch (error) {
    console.error("Ошибка инициализации заданий:", error);
    tg.showAlert("Ошибка загрузки заданий");
    return false;
  }
}

async function syncUserTasks() {
  try {
    const { data: allTasks, error: tasksError } = await supabase
      .from('tasks')
      .select('*');
    
    if (tasksError) throw tasksError;

    const { data: userTasks, error: userTasksError } = await supabase
      .from('user_tasks')
      .select('*')
      .eq('user_id', appState.userId);
    
    if (userTasksError) throw userTasksError;

    const existingTaskIds = userTasks.map(t => t.task_id);
    const tasksToAdd = allTasks
      .filter(task => !existingTaskIds.includes(task.task_id))
      .map(task => ({
        user_id: appState.userId,
        task_id: task.task_id,
        access: 0,
        completed: 0
      }));

    if (tasksToAdd.length > 0) {
      const { error: insertError } = await supabase
        .from('user_tasks')
        .insert(tasksToAdd);
      
      if (insertError) throw insertError;
    }

    appState.userTasks = userTasks.concat(tasksToAdd);
    return true;
    
  } catch (error) {
    console.error("Ошибка синхронизации:", error);
    throw error;
  }
}

async function loadTasks() {
  try {
    const { data: allTasks, error } = await supabase
      .from('tasks')
      .select('*')
      .order('task_id', { ascending: true });

    if (error) throw error;
    
    if (allTasks) {
      const groupedTasks = {};
      allTasks.forEach(task => {
        const [blockId] = task.task_id.split('-');
        if (!groupedTasks[blockId]) {
          groupedTasks[blockId] = {
            price: task.price,
            reward: task.reward,
            tasks: []
          };
        }
        
        const userTask = appState.userTasks.find(t => t.task_id === task.task_id);
        groupedTasks[blockId].tasks.push({
          ...task,
          access: userTask?.access || 0,
          completed: userTask?.completed || 0
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

  tasksContainer.innerHTML = '<div class="header"><div class="user-info"><div class="user-name">Задания</div></div></div>';

  if (!appState.tasks || appState.tasks.length === 0) {
    tasksContainer.innerHTML += '<div class="card"><p>Нет доступных заданий</p></div>';
    return;
  }

  appState.tasks.forEach((taskBlock, blockIndex) => {
    if (!taskBlock || !taskBlock.tasks) return;
    
    const hasUncompletedTasks = taskBlock.tasks.some(task => task.completed === 0);
    if (!hasUncompletedTasks) return;

    const price = taskBlock.price || 0;
    const reward = taskBlock.reward || 0;
    const blockName = `Блок заданий #${blockIndex + 1}`;

    const blockCard = document.createElement('div');
    blockCard.className = 'card task-card';
    
    blockCard.innerHTML = `
      <div class="card-title">
        <i class="fas fa-star"></i>
        ${blockName}
      </div>
      <div class="badge badge-primary">
        <i class="fas fa-coins"></i> Стоимость: ${price} AVVA
      </div>
      <div class="badge badge-premium" style="margin-top: 0.5rem;">
        <i class="fas fa-gem"></i> Награда: ${reward} очков
      </div>
      <div class="task-steps">
    `;

    taskBlock.tasks.forEach((task, taskIndex) => {
      if (task.completed === 0) {
        const taskName = task.name || `Задание ${taskIndex + 1}`;
        const taskText = task.text || 'Описание отсутствует';
        
        blockCard.querySelector('.task-steps').innerHTML += `
          <div class="task-step">
            <div class="step-number">${taskIndex + 1}</div>
            <div class="step-content">
              <div class="step-title">${taskName}</div>
              <div class="step-description">${taskText}</div>
            </div>
          </div>
        `;
      }
    });

    const startButton = document.createElement('button');
    startButton.className = 'btn btn-primary';
    startButton.textContent = 'Начать';
    startButton.onclick = function() {
      showConfirmAvvaModal(price, reward);
    };

    blockCard.appendChild(startButton);
    tasksContainer.appendChild(blockCard);
  });
}

async function loadTeams() {
  try {
    const { data, error } = await supabase
      .from('teams')
      .select('team_id, score')
      .order('score', { ascending: false });

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

  const existingCards = teamsContainer.querySelectorAll('.card');
  existingCards.forEach(card => card.remove());

  appState.teams.forEach((team, index) => {
    const teamCard = document.createElement('div');
    teamCard.className = 'card';
    
    const isTopTeam = index < 3;
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

function showTaskDetails(task) {
  appState.currentTask = task;
  switchTab('task-details');
}

function showConfirmAvvaModal(avvaCost, reward) {
  document.getElementById("confirmAvvaText").innerHTML = `
    Вы подтверждаете списание <strong>${avvaCost} AVVA</strong>?<br><br>
    <i class="fas fa-gem"></i> Награда: <strong>${reward} очков</strong>
  `;
  
  const confirmBtn = document.getElementById("confirmAvvaBtn");
  confirmBtn.onclick = function() {
    startTask(avvaCost);
    closeModal('confirmAvvaModal');
  };
  
  document.getElementById("confirmAvvaModal").classList.add('active');
  tg.HapticFeedback.impactOccurred('light');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
  tg.HapticFeedback.impactOccurred('light');
}

function switchTab(tabName) {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
  });
  
  if (tabName !== 'task-details') {
    document.querySelector(`.nav-item[onclick="switchTab('${tabName}')"]`).classList.add('active');
  }
  
  document.querySelectorAll('.page').forEach(page => {
    page.classList.remove('active');
  });
  
  document.getElementById(`${tabName}-page`).classList.add('active');
}

async function loadUserData() {
  if (!appState.userId) return;
  
  try {
    const { data } = await supabase
      .from('users')
      .select('cash')
      .eq('user_id', appState.userId)
      .single();

    if (data) {
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
    const { data: cashData } = await supabase
      .from('users')
      .select('user_id, cash, name')
      .order('cash', { ascending: false })
      .limit(10);
    
    const { data: tasksData } = await supabase
      .from('users')
      .select('user_id, countoftasks, name')
      .order('countoftasks', { ascending: false })
      .limit(10);
    
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
    
    const userName = user.name || `Игрок ${user.user_id.slice(0, 4)}`;
    
    item.innerHTML = `
      <div class="rating-position">${index + 1}</div>
      <div class="rating-user" title="${userName}">${userName}</div>
      <div class="rating-value">${user[valueField] || 0}</div>
    `;
    
    container.appendChild(item);
  });
}

function renderAllRatings() {
  renderRatingList('cash-rating', appState.ratings.cash, 'cash');
  renderRatingList('tasks-rating', appState.ratings.tasks, 'countoftasks');
  renderRatingList('invites-rating', appState.ratings.invites, 'invites');
}

async function startTask(avvaCost) {
  if (appState.balance < avvaCost) {
    tg.showAlert("Недостаточно AVVA на балансе");
    return;
  }

  try {
    appState.balance -= avvaCost;
    updateUI();

    const { error } = await supabase
      .from('users')
      .update({ 
        cash: appState.balance
      })
      .eq('user_id', appState.userId);

    if (error) throw error;

    tg.showPopup({ 
      title: "Задание начато!", 
      message: `Списано ${avvaCost} AVVA` 
    });
    
    await loadTasks();
    
  } catch (error) {
    console.error("Ошибка:", error);
    appState.balance += avvaCost;
    updateUI();
    tg.showAlert("Ошибка при начале задания");
  }
}

async function initApp() {
  try {
    updateUI();
    await loadUserData();
    await initUserTasks();
    await loadTeams();
    await loadTasks();
    await loadAllRatings();
    switchTab('home');

    window.closeModal = closeModal;
    window.switchTab = switchTab;
    window.startTask = startTask;
    window.showTaskDetails = showTaskDetails;
    window.showConfirmAvvaModal = showConfirmAvvaModal;

  } catch (error) {
    console.error("Ошибка инициализации:", error);
    tg.showAlert("Ошибка загрузки приложения");
  }
}
document.addEventListener('DOMContentLoaded', initApp);