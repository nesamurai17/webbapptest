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
  activeTimers: {},
  ratings: {
    cash: [],
    tasks: [],
    invites: []
  }
};

function startTaskTimer(taskId, callback) {
  if (appState.activeTimers[taskId]) {
    clearInterval(appState.activeTimers[taskId]);
  }

  let secondsLeft = 30;
  const button = document.querySelector(`.step-action[data-task-id="${taskId}"]`);
  
  if (!button) return;

  // Сохраняем оригинальное содержимое кнопки
  const originalContent = button.innerHTML;
  
  button.innerHTML = `<i class="fas fa-clock"></i> ${secondsLeft}s`;
  button.classList.add('timer-active');
  button.onclick = null;

  const timer = setInterval(() => {
    secondsLeft--;
    button.innerHTML = `<i class="fas fa-clock"></i> ${secondsLeft}s`;
    
    if (secondsLeft <= 0) {
      clearInterval(timer);
      button.innerHTML = originalContent;
      button.classList.remove('timer-active');
      delete appState.activeTimers[taskId];
      
      // Восстанавливаем обработчик
      button.onclick = (e) => completeTaskFromLink(e, taskId);
      
      // Вызываем callback после завершения таймера
      if (callback) callback();
    }
  }, 1000);

  appState.activeTimers[taskId] = timer;
}

// Модифицируем функцию completeTaskFromLink
async function completeTaskFromLink(event, taskId) {
  event.preventDefault();
  const url = event.target.getAttribute('href');
  
  try {
    // Получаем blockId из taskId
    const task = appState.tasks.flatMap(b => b.tasks).find(t => t.task_id === taskId);
    if (!task) throw new Error('Task not found');
    
    const [blockId] = taskId.split('-');
    
    // Открываем ссылку в новом окне
    if (url && url !== '#') {
      window.open(url, '_blank');
    }
    
    // Запускаем таймер перед выполнением задания
    startTaskTimer(taskId, async () => {
      // Показываем загрузку
      showLoading('Проверяем выполнение задания...');
      
      // Отмечаем задание выполненным после таймера
      await completeTask(taskId, blockId);
      
      // Скрываем загрузку
      hideLoading();
    });
  } catch (error) {
    console.error("Ошибка выполнения задания:", error);
    showError("Ошибка выполнения задания");
    hideLoading();
  }
}

// Добавляем функции для показа/скрытия загрузки
function showLoading(message = 'Загрузка...') {
  const loadingOverlay = document.getElementById('loadingOverlay') || createLoadingOverlay();
  const loadingText = loadingOverlay.querySelector('.loading-text');
  loadingText.textContent = message;
  loadingOverlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function hideLoading() {
  const loadingOverlay = document.getElementById('loadingOverlay');
  if (loadingOverlay) {
    loadingOverlay.style.display = 'none';
    document.body.style.overflow = '';
  }
}

function createLoadingOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'loadingOverlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(5px);
    display: none;
    justify-content: center;
    align-items: center;
    flex-direction: column;
    z-index: 2000;
  `;
  
  const spinner = document.createElement('div');
  spinner.className = 'loading-spinner';
  spinner.style.cssText = `
    width: 50px;
    height: 50px;
    border: 5px solid rgba(255, 255, 255, 0.1);
    border-radius: 50%;
    border-top-color: var(--primary);
    animation: spin 1s linear infinite;
    margin-bottom: 1rem;
  `;
  
  const text = document.createElement('div');
  text.className = 'loading-text';
  text.style.cssText = `
    color: white;
    font-size: 1rem;
    max-width: 80%;
    text-align: center;
    word-wrap: break-word;
  `;
  
  overlay.appendChild(spinner);
  overlay.appendChild(text);
  document.body.appendChild(overlay);
  
  return overlay;
}


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
    showError("Ошибка загрузки заданий");
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

    // 4. Фильтрация выполненных блоков
    appState.tasks = Object.values(groupedTasks).filter(block => {
      // Показываем блок, если:
      // 1. Есть хотя бы одно задание с доступом и не выполненное
      // 2. Или если нет доступа ни к одному заданию
      const hasAccess = block.tasks.some(task => {
        const userTask = userTaskMap.get(task.task_id);
        return userTask?.access === 1;
      });

      const allCompleted = block.tasks.every(task => {
        const userTask = userTaskMap.get(task.task_id);
        return userTask?.completed === 1;
      });

      return !allCompleted && (hasAccess || !hasAccess);
    });
    
    console.log('[loadTasks] Сформировано блоков заданий:', appState.tasks.length);
    
    renderTasks();
    return true;

  } catch (error) {
    console.error('[loadTasks] Критическая ошибка:', error);
    showError("Ошибка загрузки списка заданий");
    
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

async function completeTask(taskId, blockId) {
  try {
    // Обновляем статус задания в базе данных
    const { error: updateError } = await supabase
      .from('user_tasks')
      .update({ completed: 1 })
      .eq('user_id', appState.userId)
      .eq('task_id', taskId);
    
    if (updateError) throw updateError;

    // Обновляем локальное состояние
    appState.userTasks = appState.userTasks.map(task => {
      if (task.task_id === taskId) {
        return { ...task, completed: 1 };
      }
      return task;
    });

    // Проверяем, все ли задания в блоке выполнены
    const block = appState.tasks.find(b => b.blockId === blockId);
    if (!block) return true;

    const allTasksInBlock = block.tasks || [];
    const allCompleted = allTasksInBlock.every(t => {
      const userTask = appState.userTasks.find(ut => ut.task_id === t.task_id);
      return userTask?.completed === 1;
    });

    if (allCompleted) {
      // Начисляем награду за выполнение всех заданий блока
      if (block.reward > 0) {
        appState.balance += block.reward;
        updateUI();

        // Обновляем баланс в базе данных
        const { error: balanceError } = await supabase
          .from('users')
          .update({ cash: appState.balance })
          .eq('user_id', appState.userId);
        
        if (balanceError) throw balanceError;

        showSuccess(`Вы выполнили все задания блока и получили ${block.reward} AVVA!`);
      }

      // Перезагружаем задания, чтобы скрыть выполненный блок
      await loadTasks();
    } else {
      // Если не все задания выполнены, просто обновляем отображение текущего блока
      renderTasks();
    }

    return true;
  } catch (error) {
    console.error("Ошибка выполнения задания:", error);
    throw error;
  }
}

async function completeTaskFromLink(event, taskId) {
  event.preventDefault();
  const url = event.target.getAttribute('href');
  
  try {
    // Получаем blockId из taskId
    const task = appState.tasks.flatMap(b => b.tasks).find(t => t.task_id === taskId);
    if (!task) throw new Error('Task not found');
    
    const [blockId] = taskId.split('-');
    
    // Открываем ссылку в новом окне
    if (url && url !== '#') {
      window.open(url, '_blank');
    }
    
    // Отмечаем задание выполненным
    await completeTask(taskId, blockId);
  } catch (error) {
    console.error("Ошибка выполнения задания:", error);
    showError("Ошибка выполнения задания");
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
        <i class="fas fa-gem"></i> Награда: ${reward} AVVA
      </div>
      <div class="task-steps">
    `;

    // Проверяем, есть ли доступ к заданиям этого блока
    const hasAccess = taskBlock.tasks.some(task => {
      const userTask = appState.userTasks.find(ut => ut.task_id === task.task_id);
      return userTask?.access === 1;
    });

    taskBlock.tasks.forEach((task, taskIndex) => {
      const taskName = task.name || `Задание ${taskIndex + 1}`;
      const taskText = task.text || 'Описание отсутствует';
      const userTask = appState.userTasks.find(ut => ut.task_id === task.task_id) || {};
      const isCompleted = userTask.completed === 1;
      
      const stepDiv = document.createElement('div');
      stepDiv.className = `task-step ${isCompleted ? 'completed-step' : ''}`;
      stepDiv.innerHTML = `
        <div class="step-number">${taskIndex + 1}</div>
        <div class="step-content">
          <div class="step-title">${taskName}</div>
          <div class="step-description">${taskText}</div>
        </div>
      `;
      
      if (hasAccess && !isCompleted) {
        const goButton = document.createElement('a');
        goButton.className = 'btn btn-success btn-small step-action';
        goButton.innerHTML = '<i class="fas fa-check"></i> GO';
        goButton.href = task.url || '#';
        goButton.target = '_blank';
        goButton.setAttribute('data-task-id', task.task_id);
        
        // Проверяем, есть ли активный таймер для этого задания
        if (appState.activeTimers[task.task_id]) {
          // Если таймер активен, показываем его вместо кнопки
          const timer = appState.activeTimers[task.task_id];
          let secondsLeft = parseInt(goButton.textContent.match(/\d+/)?.[0]) || 30;
          
          goButton.innerHTML = `<i class="fas fa-clock"></i> ${secondsLeft}s`;
          goButton.classList.add('timer-active');
        } else {
          // Нормальная кнопка GO
          goButton.onclick = (e) => completeTaskFromLink(e, task.task_id);
        }
        
        stepDiv.appendChild(goButton);
      }
      
      blockCard.querySelector('.task-steps').appendChild(stepDiv);
    });

    // Добавляем кнопку "Начать" ТОЛЬКО если доступа нет
    if (!hasAccess) {
      const startButton = document.createElement('button');
      startButton.className = 'btn btn-primary';
      startButton.textContent = 'Начать';
      startButton.onclick = function() {
        if (appState.balance < price) {
          showError(`Недостаточно AVVA. Нужно: ${price}, у вас: ${appState.balance}`);
          return;
        }
        showConfirmAvvaModal(price, reward, taskBlock.blockId, startButton, blockCard);
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
function showConfirmAvvaModal(price, reward, blockId, startButton, blockCard) {
  const modal = document.getElementById('confirmAvvaModal');
  const textElement = document.getElementById('confirmAvvaText');
  const button = document.getElementById('confirmAvvaBtn');
  
  textElement.innerHTML = `Вы уверены, что хотите потратить <strong>${price} AVVA</strong> для доступа к заданиям?<br><br>Награда: <strong>${reward} AVVA</strong>`;
  
  button.onclick = async function() {
    try {
      if (appState.balance < price) {
        showError(`Недостаточно AVVA. Нужно: ${price}, у вас: ${appState.balance}`);
        closeModal('confirmAvvaModal');
        return;
      }
      
      await startTask(price, blockId);
      // После успешного подтверждения скрываем кнопку и показываем бейдж
      startButton.style.display = 'none';
      const accessBadge = document.createElement('div');
      accessBadge.className = 'badge badge-success';
      accessBadge.innerHTML = '<i class="fas fa-check-circle"></i> Доступ открыт';
      blockCard.appendChild(accessBadge);
      closeModal('confirmAvvaModal');
    } catch (error) {
      console.error("Ошибка при начале задания:", error);
      showError("Ошибка при начале задания");
      closeModal('confirmAvvaModal');
    }
  };
  
  modal.classList.add('active');
  tg.HapticFeedback.impactOccurred('light');
}

async function startTask(avvaCost, blockId) {
  if (appState.balance < avvaCost) {
    showError("Недостаточно AVVA на балансе");
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

    showSuccess(`Списано ${avvaCost} AVVA. Теперь у вас есть доступ к заданиям блока.`);
    
    // Перезагружаем задания, чтобы отобразить изменения
    await loadTasks();
    
  } catch (error) {
    console.error("Ошибка:", error);
    // Откатываем изменения в случае ошибки
    appState.balance += avvaCost;
    updateUI();
    showError("Ошибка при начале задания");
  }
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
    showError("Ошибка загрузки списка команд");
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

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
  tg.HapticFeedback.impactOccurred('light');
}

function showSuccess(message) {
  const modal = document.getElementById('successModal');
  const textElement = document.getElementById('successText');
  textElement.textContent = message;
  modal.classList.add('active');
  tg.HapticFeedback.impactOccurred('light');
}

function showError(message) {
  const modal = document.getElementById('errorModal');
  const textElement = document.getElementById('errorText');
  textElement.textContent = message;
  modal.classList.add('active');
  tg.HapticFeedback.impactOccurred('heavy');
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
    showError("Ошибка загрузки данных");
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
    showError("Ошибка загрузки рейтингов");
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
    window.completeTaskFromLink = completeTaskFromLink;

    console.log("Приложение успешно инициализировано");
  } catch (error) {
    console.error("Ошибка инициализации:", error);
    showError("Ошибка загрузки приложения: " + error.message);
  }
}
document.addEventListener('DOMContentLoaded', initApp);