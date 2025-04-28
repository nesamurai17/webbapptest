const tg = window.Telegram.WebApp;
tg.expand();
tg.enableClosingConfirmation();

const supabaseUrl = 'https://koqnqotxchpimovxcnva.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtvcW5xb3R4Y2hwaW1vdnhjbnZhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NTE3Mzk4MCwiZXhwIjoyMDYwNzQ5OTgwfQ.bFAEslvrVDE2i7En3Ln8_AbQPtgvH_gElnrBcPBcSMc';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);



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

// function showLoading(message = 'AVVA GAME LOADING...') {
//   const loadingOverlay = document.getElementById('loadingOverlay');
//   // const loadingText = loadingOverlay.querySelector('.loading-text');
  
//   loadingText.textContent = message;
//   loadingOverlay.style.display = 'flex';
//   loadingOverlay.classList.remove('hidden');
//   document.body.style.overflow = 'hidden';
  
//   // Добавляем анимацию пульсации для текста
//   loadingText.style.animation = 'pulse 1.5s infinite';
  
//   // Запускаем анимацию прогресса
//   // const progressBar = loadingOverlay.querySelector('.loading-progress-bar');
//   if (progressBar) {
//     progressBar.style.animation = 'progress 2s ease-in-out infinite, gradient 3s ease infinite';
//   }
// }

const appState = {
  balance: 0,
  userId: tg.initDataUnsafe?.user?.id || null,
  currentTask: null,
  teams: [],
  tasks: [],
  userTasks: [],
  activeTimers: {},
  timerStartTimes: {},
  ratings: {
    cash: [],
    tasks: [],
    invites: []
  },
  referralLink: '',
  walletAddress: null,
  walletBalance: 0,
  isWalletConnected: false
};

function updateUI() {
  document.getElementById("balance").textContent = `${appState.balance} AVVA`;
  
  if (tg.initDataUnsafe?.user) {
    const user = tg.initDataUnsafe.user;
    document.getElementById("username").textContent = user.first_name;
    
    if (user.photo_url) {
      document.getElementById("user-avatar").src = user.photo_url;
    }
  }

  if (appState.walletAddress) {
    const shortAddress = `${appState.walletAddress.substring(0, 4)}...${appState.walletAddress.substring(appState.walletAddress.length - 4)}`;
    document.getElementById("wallet-address").textContent = shortAddress;
  }
}

async function initWallet() {
  try {
    if (window.ton) {
      const accounts = await window.ton.send("ton_requestAccounts");
      
      if (accounts && accounts.length > 0) {
        const walletAddress = accounts[0];
        appState.walletAddress = walletAddress;
        appState.isWalletConnected = true;
        
        const { error } = await supabase
          .from('users')
          .update({ wallet_address: walletAddress })
          .eq('user_id', appState.userId);
        
        if (!error) {
          showSuccess("TON кошелек успешно подключен!");
          updateUI();
          await getWalletBalance();
        } else {
          showError("Ошибка сохранения кошелька");
        }
      } else {
        showError("Не удалось получить адрес кошелька");
      }
    } else {
      showError("TON Provider не обнаружен. Установите TonWallet или другую поддерживаемую программу.");
    }
  } catch (error) {
    console.error("Ошибка подключения кошелька:", error);
    showError("Ошибка подключения кошелька");
  }
}

async function getWalletBalance() {
  if (!appState.walletAddress) return;
  
  try {
    const balance = await window.ton.send("ton_getBalance", { address: appState.walletAddress });
    appState.walletBalance = balance;
    updateUI();
  } catch (error) {
    console.error("Ошибка получения баланса:", error);
    showError("Ошибка получения баланса");
  }
}

async function loadUserData() {
  if (!appState.userId) return;
  
  try {
    const { data } = await supabase
      .from('users')
      .select('cash, wallet_address, countoftasks')
      .eq('user_id', appState.userId)
      .single();

    if (data) {
      appState.balance = data.cash || 0;
      appState.walletAddress = data.wallet_address || null;
      updateUI();
    }
  } catch (error) {
    console.error("Ошибка загрузки данных:", error);
    showError("Ошибка загрузки данных");
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
    const { data: allTasks, error, status } = await supabase
      .from('tasks')
      .select('*')
      .order('task_id', { ascending: true });

    if (error) {
      console.error('[loadTasks] Ошибка Supabase:', error);
      throw new Error(`Database error: ${error.message}`);
    }

    if (!Array.isArray(allTasks)) {
      console.error('[loadTasks] Данные не являются массивом:', allTasks);
      throw new Error('Invalid data format from database');
    }

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

    // Фильтруем блоки: показываем только те, где не все задания выполнены
    appState.tasks = Object.values(groupedTasks).filter(block => {
      const allCompleted = block.tasks.every(task => {
        const userTask = userTaskMap.get(task.task_id);
        return userTask?.completed === 1;
      });
      return !allCompleted;
    });
    
    renderTasks();
    return true;

  } catch (error) {
    console.error('[loadTasks] Критическая ошибка:', error);
    showError( error);
    
    // Создаем заглушку для отображения
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

function renderTasks() {
  const tasksContainer = document.getElementById('tasks-container');
  if (!tasksContainer) return;

  tasksContainer.innerHTML = '';

  if (!appState.tasks || appState.tasks.length === 0) {
    tasksContainer.innerHTML = '<div class="card-title">Нет доступных заданий</div>';
    return;
  }

  appState.tasks.forEach((taskBlock, blockIndex) => {
    if (!taskBlock || !taskBlock.tasks) return;

    const price = taskBlock.price || 0;
    const reward = taskBlock.reward || 0;
    const blockName = `Блок заданий #${blockIndex + 1}`;

    const blockCard = document.createElement('div');
    blockCard.className = 'task-card';
    
    blockCard.innerHTML = `
      <div class="inner-2">
        <div class="coin-balance-2">${blockName}</div>
        <div class="frame-7">
          <div class="card-title">Стоимость: ${price} AVVA | Награда: ${reward} AVVA</div>
        </div>
        <div class="task-steps"></div>
      </div>
    `;

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
      stepDiv.className = 'frame-7';
      stepDiv.innerHTML = `
        <div class="card-title"><strong>${taskName}</strong></div>
        <div class="card-title">${taskText}</div>
      `;
      
      if (hasAccess && !isCompleted) {
        const goButton = document.createElement('button');
        goButton.className = 'div-wrapper';
        goButton.innerHTML = '<div class="text-wrapper-5">Выполнить</div>';
        goButton.onclick = (e) => completeTaskFromLink(e, task.task_id);
        
        if (appState.activeTimers[task.task_id]) {
          goButton.innerHTML = '<div class="text-wrapper-5"><i class="fas fa-clock"></i></div>';
          goButton.classList.add('timer-active');
        }
        
        stepDiv.appendChild(goButton);
      }
      
      blockCard.querySelector('.task-steps').appendChild(stepDiv);
    });

    if (!hasAccess) {
      const startButton = document.createElement('button');
      startButton.className = 'div-wrapper';
      startButton.innerHTML = '<div class="text-wrapper-5">Начать</div>';
      startButton.onclick = function() {
        if (appState.balance < price) {
          showError(`Недостаточно AVVA. Нужно: ${price}, у вас: ${appState.balance}`);
          return;
        }
        showConfirmAvvaModal(price, reward, taskBlock.blockId, startButton, blockCard);
      };
      blockCard.querySelector('.inner-2').appendChild(startButton);
    }

    tasksContainer.appendChild(blockCard);
  });
}

async function completeTaskFromLink(event, taskId) {
  event.preventDefault();
  
  try {
    const task = appState.tasks.flatMap(b => b.tasks).find(t => t.task_id === taskId);
    if (!task) throw new Error('Task not found');
    
    const [blockId] = taskId.split('-');
    
    if (task.url && task.url !== '#') {
      window.open(task.url, '_blank');
    }
    
    startTaskTimer(taskId, async () => {
      try {
        await completeTask(taskId, blockId);
      } catch (error) {
        console.error("Ошибка выполнения задания:", error);
        showError("Ошибка выполнения задания");
      }
    });
  } catch (error) {
    console.error("Ошибка выполнения задания:", error);
    showError("Ошибка выполнения задания");
  }
}

function startTaskTimer(taskId, callback) {
  if (appState.activeTimers[taskId]) {
    clearTimeout(appState.activeTimers[taskId]);
  }

  const button = document.querySelector(`.div-wrapper[onclick="completeTaskFromLink(event, '${taskId}')"]`);
  if (!button) return;

  button.innerHTML = '<div class="text-wrapper-5"><i class="fas fa-clock"></i></div>';
  button.classList.add('timer-active');
  button.onclick = null;

  // Сохраняем время старта таймера
  appState.timerStartTimes[taskId] = Date.now();
  saveTimersToStorage();

  const timer = setTimeout(() => {
    completeTimer(taskId, button, '<div class="text-wrapper-5">Выполнить</div>', callback);
  }, 60000); // 60 секунд

  appState.activeTimers[taskId] = timer;
}

function completeTimer(taskId, button, originalContent, callback) {
  clearTimer(taskId);
  button.innerHTML = originalContent;
  button.classList.remove('timer-active');
  button.onclick = (e) => completeTaskFromLink(e, taskId);
  if (callback) callback();
}

function clearTimer(taskId) {
  if (appState.activeTimers[taskId]) {
    clearTimeout(appState.activeTimers[taskId]);
  }
  delete appState.activeTimers[taskId];
  delete appState.timerStartTimes[taskId];
  saveTimersToStorage();
}

function saveTimersToStorage() {
  localStorage.setItem('activeTimers', JSON.stringify(appState.timerStartTimes));
}

function restoreTimers() {
  const savedTimers = localStorage.getItem('activeTimers');
  if (!savedTimers) return;

  const now = Date.now();
  appState.timerStartTimes = JSON.parse(savedTimers);

  for (const taskId in appState.timerStartTimes) {
    const startTime = appState.timerStartTimes[taskId];
    const elapsed = now - startTime;
    const remaining = 60000 - elapsed;

    if (remaining > 0) {
      const button = document.querySelector(`.div-wrapper[onclick="completeTaskFromLink(event, '${taskId}')"]`);
      if (button) {
        button.innerHTML = '<div class="text-wrapper-5"><i class="fas fa-clock"></i></div>';
        button.classList.add('timer-active');
        button.onclick = null;

        appState.activeTimers[taskId] = setTimeout(() => {
          completeTimer(taskId, button, '<div class="text-wrapper-5">Выполнить</div>', () => {
            const [blockId] = taskId.split('-');
            completeTask(taskId, blockId);
          });
        }, remaining);
      }
    } else {
      // Таймер уже истек, отмечаем задание выполненным
      const [blockId] = taskId.split('-');
      completeTask(taskId, blockId);
      delete appState.timerStartTimes[taskId];
    }
  }
  saveTimersToStorage();
}

async function updateTaskAccess(blockId) {
  try {
    const { data: blockTasks, error: tasksError } = await supabase
      .from('tasks')
      .select('task_id')
      .like('task_id', `${blockId}-%`);
    
    if (tasksError) throw tasksError;
    
    if (blockTasks && blockTasks.length > 0) {
      const taskIds = blockTasks.map(task => task.task_id);
      
      const { error: updateError } = await supabase
        .from('user_tasks')
        .update({ access: 1 })
        .eq('user_id', appState.userId)
        .in('task_id', taskIds);
      
      if (updateError) throw updateError;
      
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
    const { error: updateError } = await supabase
      .from('user_tasks')
      .update({ completed: 1 })
      .eq('user_id', appState.userId)
      .eq('task_id', taskId);
    
    if (updateError) throw updateError;

    appState.userTasks = appState.userTasks.map(task => {
      if (task.task_id === taskId) {
        return { ...task, completed: 1 };
      }
      return task;
    });

    const block = appState.tasks.find(b => b.blockId === blockId);
    if (!block) return true;

    const allTasksInBlock = block.tasks || [];
    const allCompleted = allTasksInBlock.every(t => {
      const userTask = appState.userTasks.find(ut => ut.task_id === t.task_id);
      return userTask?.completed === 1;
    });

    if (allCompleted) {
      if (block.reward > 0) {
        appState.balance += block.reward;
        updateUI();

        const { error: balanceError } = await supabase
          .from('users')
          .update({ cash: appState.balance })
          .eq('user_id', appState.userId);
        
        if (balanceError) throw balanceError;

        showSuccess(`Вы выполнили все задания блока и получили ${block.reward} AVVA!`);
      }

      await loadTasks();
    } else {
      renderTasks();
    }

    return true;
  } catch (error) {
    console.error("Ошибка выполнения задания:", error);
    throw error;
  }
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
      startButton.style.display = 'none';
      const accessBadge = document.createElement('div');
      accessBadge.className = 'card-title';
      accessBadge.innerHTML = '<i class="fas fa-check-circle"></i> Доступ открыт';
      blockCard.querySelector('.inner-2').appendChild(accessBadge);
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
    appState.balance -= avvaCost;
    updateUI();

    const { error: balanceError } = await supabase
      .from('users')
      .update({ cash: appState.balance })
      .eq('user_id', appState.userId);

    if (balanceError) throw balanceError;

    await updateTaskAccess(blockId);

    showSuccess(`Списано ${avvaCost} AVVA. Теперь у вас есть доступ к заданиям блока.`);
    
    await loadTasks();
    
  } catch (error) {
    console.error("Ошибка:", error);
    appState.balance += avvaCost;
    updateUI();
    showError("Ошибка при начале задания");
  }
}

async function loadTeams() {
  try {
    if (!appState.userId) {
      showError("Не удалось определить ваш ID");
      return;
    }

    // Получаем только имена пользователей, у которых team = нашему user_id
    const { data: teamMembers, error } = await supabase
      .from('users')
      .select('name, cash')
      .eq('team', appState.userId)
      .order('cash', { ascending: false }); // Сортируем по балансу

    if (error) throw error;
    
    appState.teams = teamMembers || []; // Если null, используем пустой массив
    
    renderTeams();
  } catch (error) {
    console.error("Ошибка загрузки команды:", error);
    appState.teams = [];
    renderTeams();
    showError("Ошибка загрузки списка участников");
  }
}

function renderTeams() {
  const teamsContainer = document.getElementById('teams-container');
  if (!teamsContainer) return;

  // Полностью очищаем контейнер
  teamsContainer.innerHTML = '';

  // Добавляем заголовок
  const headerCard = document.createElement('div');
  headerCard.className = 'task-card';
  headerCard.innerHTML = `
    <div class="inner-2">
      <div class="coin-balance-2">Мои друзья</div>
      <div class="frame-7">
        <div class="card-title">Всего: ${appState.teams.length}</div>
      </div>
      <div class="frame-8">
        <button class="div-wrapper" onclick="showReferralModal()">
          <div class="text-wrapper-5">Пригласить друзей</div>
        </button>
      </div>
    </div>
  `;
  teamsContainer.appendChild(headerCard);

  // Если нет друзей
  if (appState.teams.length === 0) {
    const emptyCard = document.createElement('div');
    emptyCard.className = 'task-card';
    emptyCard.innerHTML = `
      <div class="inner-2">
        <div class="frame-7">
          <div class="card-title">Пока никто не присоединился по вашей ссылке</div>
        </div>
      </div>
    `;
    teamsContainer.appendChild(emptyCard);
    return;
  }

  // Добавляем список друзей
  appState.teams.forEach((friend, index) => {
    const friendCard = document.createElement('div');
    friendCard.className = 'task-card';
    
    friendCard.innerHTML = `
      <div class="inner-2">
        <div class="user-info-container">
          <div class="user-avatar">
            <div class="image" style="
              background-color: var(--primary);
              display: flex; 
              align-items: center; 
              justify-content: center; 
              color: white; 
              font-weight: bold; 
              border-radius: 50%; 
              width: 46px; 
              height: 46px;">
              ${index + 1}
            </div>
            <div class="text-wrapper-2">${friend.name || 'Без имени'}</div>
          </div>
          <div class="wallet-info">
            <div class="coin-balance">${friend.cash || 0} AVVA</div>
          </div>
        </div>
      </div>
    `;
    
    teamsContainer.appendChild(friendCard);
  });
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
    
    const { data: topTeams } = await supabase
      .from('teams')
      .select('team_id, members')
      .order('members', { ascending: false })
      .limit(10);
    
    let invitesData = [];
    if (topTeams && topTeams.length > 0) {
      const captainIds = topTeams.map(team => team.team_id);
      
      const { data: captainsData } = await supabase
        .from('users')
        .select('user_id, name')
        .in('user_id', captainIds);
      
      invitesData = topTeams.map(team => {
        const captain = captainsData?.find(c => c.user_id === team.team_id) || {};
        return {
          user_id: team.team_id,
          name: captain.name || `Капитан ${team.team_id}`,
          members: team.members || team.members 
        };
      });
    }
    
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
    container.innerHTML = '<div class="card-title">Нет данных</div>';
    return;
  }
  
  data.forEach((user, index) => {
    const item = document.createElement('div');
    item.className = 'frame-7';
    
    const userName = user.name || `Игрок ${user.user_id?.slice(0, 4) || '---'}`;
    const valueContent = elementId === 'invites-rating' 
      ? `${user[valueField] || 0} участников`
      : `${user[valueField] || 0}`;
    
    item.innerHTML = `<div class="card-title"><span class="span">${index + 1}. ${userName}</span> - ${valueContent}</div>`;
    container.appendChild(item);
  });
}

function renderAllRatings() {
  renderRatingList('cash-rating', appState.ratings.cash, 'cash');
  renderRatingList('tasks-rating', appState.ratings.tasks, 'countoftasks');
  renderRatingList('invites-rating', appState.ratings.invites, 'members');
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
  document.querySelectorAll('.page').forEach(page => {
    page.classList.remove('active');
  });
  
  document.getElementById(`${tabName}-page`).classList.add('active');
  
  // Update active tab
  document.querySelectorAll('.tab-2, .tab-3').forEach(tab => {
    tab.classList.remove('tab-2');
    tab.classList.add('tab-3');
  });
  
  const activeTab = document.querySelector(`[onclick="switchTab('${tabName}')"]`);
  if (activeTab) {
    activeTab.classList.remove('tab-3');
    activeTab.classList.add('tab-2');
  }
  
  // Update page title
  const pageTitle = document.getElementById('page-title');
  if (pageTitle) {
    const titles = {
      'home': 'Игра',
      'tasks': 'Задания',
      'teams': 'Команды',
      'rating': 'Рейтинг',
      'market': 'Маркет'
    };
    pageTitle.textContent = titles[tabName] || 'Игра';
  }
  
  tg.HapticFeedback.impactOccurred('light');
}

function showReferralModal() {
  if (!appState.userId) {
    showError("Не удалось получить ID пользователя");
    return;
  }

  appState.referralLink = `https://t.me/testwebappaoao_bot?start=${appState.userId}`;
  
  const modal = document.getElementById('referralModal');
  const linkInput = document.getElementById('referralLink');
  linkInput.value = appState.referralLink;
  
  modal.classList.add('active');
  tg.HapticFeedback.impactOccurred('light');
}

function copyReferralLink() {
  if (!appState.referralLink) return;
  
  navigator.clipboard.writeText(appState.referralLink)
    .then(() => {
      showSuccess("Ссылка скопирована в буфер обмена");
    })
    .catch(err => {
      console.error("Ошибка копирования:", err);
      showError("Не удалось скопировать ссылку");
    });
}

function shareToTelegram() {
  if (!appState.referralLink) return;
  
  const text = `Присоединяйся к игре AVVA через мою реферальную ссылку: ${appState.referralLink}`;
  const url = `https://t.me/share/url?url=${encodeURIComponent(appState.referralLink)}&text=${encodeURIComponent(text)}`;
  
  window.open(url, '_blank');
}

async function initApp() {
  try {
    updateUI();
    await loadUserData();
    await initUserTasks();
    await loadTasks();
    await loadTeams();
    await loadAllRatings();
    switchTab('home');

    // Восстанавливаем таймеры
    restoreTimers();

    // Сохраняем таймеры при закрытии
    window.addEventListener('beforeunload', saveTimersToStorage);

    // Экспорт функций
    window.closeModal = closeModal;
    window.switchTab = switchTab;
    window.startTask = startTask;
    window.showConfirmAvvaModal = showConfirmAvvaModal;
    window.completeTaskFromLink = completeTaskFromLink;
    window.showReferralModal = showReferralModal;
    window.copyReferralLink = copyReferralLink;
    window.shareToTelegram = shareToTelegram;

  } catch (error) {
    console.error("Ошибка инициализации:", error);
    showError("Ошибка загрузки приложения");
  }
}

document.addEventListener('DOMContentLoaded', initApp);