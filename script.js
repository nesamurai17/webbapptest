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
    console.log('[loadTasks] Начало загрузки заданий');
    
    // 1. Загрузка данных из Supabase
    const { data: allTasks, error, status } = await supabase
      .from('tasks')
      .select('*')
      .order('task_id', { ascending: true });

    console.log(`[loadTasks] Статус запроса: ${status}`);

    if (error) {
      console.error('[loadTasks] Ошибка Supabase:', {
        message: error.message,
        code: error.code,
        details: error.details
      });
      throw new Error(`Database error: ${error.message}`);
    }

    // 2. Проверка полученных данных
    if (!Array.isArray(allTasks)) {
      console.error('[loadTasks] Данные не являются массивом:', allTasks);
      throw new Error('Invalid data format from database');
    }

    console.log(`[loadTasks] Получено ${allTasks.length} заданий`);

    // 3. Группировка заданий по блокам
    const groupedTasks = {};
    const userTaskMap = new Map(
      appState.userTasks.map(task => [task.task_id, task])
    );

    allTasks.forEach(task => {
      try {
        if (!task.task_id) {
          console.warn('[loadTasks] Задание без task_id пропущено');
          return;
        }

        const [blockId] = task.task_id.split('-');
        if (!blockId) {
          console.warn('[loadTasks] Не удалось определить blockId для:', task.task_id);
          return;
        }

        if (!groupedTasks[blockId]) {
          groupedTasks[blockId] = {
            price: task.price || 0,
            reward: task.reward || 0,
            tasks: [],
            blockId: blockId
          };
        }

        const userTask = userTaskMap.get(task.task_id) || {
          access: 0,
          completed: 0
        };

        groupedTasks[blockId].tasks.push({
          ...task,
          access: userTask.access,
          completed: userTask.completed
        });
      } catch (e) {
        console.error('[loadTasks] Ошибка обработки задания:', task, e);
      }
    });

    // 4. Сохранение и рендеринг
    appState.tasks = Object.values(groupedTasks);
    console.log('[loadTasks] Сформировано блоков заданий:', appState.tasks.length);
    
    renderTasks();
    return true;

  } catch (error) {
    console.error('[loadTasks] Критическая ошибка:', error);
    tg.showAlert("Ошибка загрузки списка заданий");
    
    // Создаем fallback данные для отображения
    appState.tasks = [{
      price: 0,
      reward: 0,
      tasks: [{
        task_id: 'fallback-1',
        name: 'Пример задания',
        text: 'Описание примера задания',
        access: 0,
        completed: 0
      }],
      blockId: 'fallback'
    }];
    
    renderTasks();
    return false;
  }
}

async function updateTaskAccess(blockId) {
  try {
    // Получаем все task_id из этого блока
    const { data: blockTasks, error: tasksError } = await supabase
      .from('tasks')
      .select('task_id')
      .like('task_id', `${blockId}-%`);
    
    if (tasksError) throw tasksError;
    
    if (blockTasks && blockTasks.length > 0) {
      const taskIds = blockTasks.map(task => task.task_id);
      
      // Обновляем access для всех задач блока у текущего пользователя
      const { error: updateError } = await supabase
        .from('user_tasks')
        .update({ access: 1 })
        .eq('user_id', appState.userId)
        .in('task_id', taskIds);
      
      if (updateError) throw updateError;
      
      // Обновляем локальное состояние
      appState.userTasks = appState.userTasks.map(task => {
        if (taskIds.includes(task.task_id)) {
          return { ...task, access: 1 };
        }
        return task;
      });
      
      return true;
    }
    return false;
  } catch (error) {
    console.error("Ошибка обновления доступа к заданиям:", error);
    throw error;
  }
}

function showConfirmAvvaModal(price, reward, blockId) {
  const modal = document.getElementById('confirmAvvaModal');
  const textElement = document.getElementById('confirmAvvaText');
  const button = document.getElementById('confirmAvvaBtn');
  
  textElement.innerHTML = `Вы уверены, что хотите потратить <strong>${price} AVVA</strong> для доступа к заданиям?<br><br>Награда: <strong>${reward} очков</strong>`;
  
  button.onclick = function() {
    startTask(price, blockId);
    closeModal('confirmAvvaModal');
  };
  
  modal.classList.add('active');
  tg.HapticFeedback.impactOccurred('light');
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

    // Проверяем, есть ли доступ к заданиям этого блока
    const hasAccess = taskBlock.tasks.every(task => {
      const userTask = appState.userTasks.find(ut => ut.task_id === task.task_id);
      return userTask?.access === 1;
    });

    taskBlock.tasks.forEach((task, taskIndex) => {
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
    });

    // Добавляем кнопку "Начать" ТОЛЬКО если доступа нет
    if (!hasAccess) {
      const startButton = document.createElement('button');
      startButton.className = 'btn btn-primary';
      startButton.textContent = 'Начать';
      startButton.id = `start-button-${blockIndex}`; // Добавляем ID для кнопки
      startButton.onclick = async function() {
        await startTask(price, reward, taskBlock.blockId);
        // После начала задания скрываем только кнопку
        this.style.display = 'none';
        // Добавляем бейдж о доступности
        const accessBadge = document.createElement('div');
        accessBadge.className = 'badge badge-success';
        accessBadge.innerHTML = '<i class="fas fa-check-circle"></i> Доступ открыт';
        blockCard.appendChild(accessBadge);
      };
      blockCard.appendChild(startButton);
    } else {
      // Добавляем сообщение о доступности
      const accessBadge = document.createElement('div');
      accessBadge.className = 'badge badge-success';
      accessBadge.innerHTML = '<i class="fas fa-check-circle"></i> Доступ открыт';
      blockCard.appendChild(accessBadge);
    }

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

async function startTask(avvaCost, blockId) {
  if (appState.balance < avvaCost) {
    tg.showAlert("Недостаточно AVVA на балансе");
    return;
  }

  try {
    // Сначала списываем AVVA
    appState.balance -= avvaCost;
    updateUI();

    // Обновляем баланс в базе данных
    const { error: balanceError } = await supabase
      .from('users')
      .update({ cash: appState.balance })
      .eq('user_id', appState.userId);

    if (balanceError) throw balanceError;

    // Обновляем доступ к заданиям блока
    await updateTaskAccess(blockId);

    tg.showPopup({ 
      title: "Задание начато!", 
      message: `Списано ${avvaCost} AVVA. Теперь у вас есть доступ к заданиям блока.` 
    });
    
    // Перезагружаем задания, чтобы отобразить изменения
    await loadTasks();
    
  } catch (error) {
    console.error("Ошибка:", error);
    // Откатываем изменения в случае ошибки
    appState.balance += avvaCost;
    updateUI();
    tg.showAlert("Ошибка при начале задания");
  }
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

async function startTask(avvaCost, blockId) {
  if (appState.balance < avvaCost) {
    tg.showAlert("Недостаточно AVVA на балансе");
    return;
  }

  try {
    // Сначала списываем AVVA
    appState.balance -= avvaCost;
    updateUI();

    // Обновляем баланс в базе данных
    const { error: balanceError } = await supabase
      .from('users')
      .update({ cash: appState.balance })
      .eq('user_id', appState.userId);

    if (balanceError) throw balanceError;

    // Обновляем доступ к заданиям блока
    await updateTaskAccess(blockId);

    tg.showPopup({ 
      title: "Задание начато!", 
      message: `Списано ${avvaCost} AVVA. Теперь у вас есть доступ к заданиям блока.` 
    });
    
    // Перезагружаем задания, чтобы отобразить изменения
    await loadTasks();
    
  } catch (error) {
    console.error("Ошибка:", error);
    // Откатываем изменения в случае ошибки
    appState.balance += avvaCost;
    updateUI();
    tg.showAlert("Ошибка при начале задания");
  }
}

async function initApp() {
  try {
    console.log("Инициализация приложения...");
    console.log("User ID:", appState.userId);
    
    updateUI();
    await loadUserData();
    await initUserTasks();
    await loadTeams();
    await loadTasks();
    await loadAllRatings();
    switchTab('home');

    // Экспорт функций в глобальную область видимости
    window.closeModal = closeModal;
    window.switchTab = switchTab;
    window.startTask = startTask;
    window.showTaskDetails = showTaskDetails;
    window.showConfirmAvvaModal = showConfirmAvvaModal;

    console.log("Приложение успешно инициализировано");
  } catch (error) {
    console.error("Ошибка инициализации:", error);
    tg.showAlert("Ошибка загрузки приложения: " + error.message);
  }
}
document.addEventListener('DOMContentLoaded', initApp);