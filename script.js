const tg = window.Telegram.WebApp;
tg.expand();
tg.enableClosingConfirmation();

// Конфигурация Supabase
const supabaseUrl = 'https://koqnqotxchpimovxcnva.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtvcW5xb3R4Y2hwaW1vdjhjbnZhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NTE3Mzk4MCwiZXhwIjoyMDYwNzQ5OTgwfQ.bFAEslvrVDE2i7En3Ln8_AbQPtgvH_gElnrBcPBcSMc';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// Состояние приложения
const appState = {
  balance: 0,
  userId: tg.initDataUnsafe?.user?.id || Math.random().toString(36).substring(2, 9), // Добавлен fallback ID
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

// Основная функция инициализации
async function initApp() {
  try {
    updateUI();
    await Promise.all([
      loadUserData(),
      initUserTasks(),
      loadTeams(),
      loadTasks(),
      loadAllRatings()
    ]);
    
    switchTab('home');
    restoreTimers();
    setupEventListeners();
    
  } catch (error) {
    console.error("Ошибка инициализации:", error);
    showError("Ошибка загрузки приложения");
  }
}

// Настройка обработчиков событий
function setupEventListeners() {
  window.addEventListener('beforeunload', saveTimersToStorage);
  
  // Глобальные функции
  window.closeModal = closeModal;
  window.switchTab = switchTab;
  window.showConfirmAvvaModal = showConfirmAvvaModal;
  window.showReferralModal = showReferralModal;
  window.copyReferralLink = copyReferralLink;
  window.shareToTelegram = shareToTelegram;
  
  // Обработчики для кнопок в DOM
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });
}

// Обновление интерфейса
function updateUI() {
  const balanceElement = document.getElementById("balance");
  if (balanceElement) balanceElement.textContent = appState.balance.toFixed(2);
  
  const tonBalanceElement = document.getElementById("ton-balance");
  if (tonBalanceElement) tonBalanceElement.textContent = appState.walletBalance.toFixed(3);
  
  if (tg.initDataUnsafe?.user) {
    const user = tg.initDataUnsafe.user;
    const usernameElement = document.getElementById("username");
    if (usernameElement) {
      usernameElement.textContent = user.first_name || "Пользователь";
    }
    
    if (user.photo_url) {
      const avatarElement = document.getElementById("user-avatar");
      if (avatarElement) avatarElement.src = user.photo_url;
    }
  }
  
  // Обновление адреса кошелька
  const walletAddressElement = document.getElementById("wallet-address");
  if (walletAddressElement && appState.walletAddress) {
    walletAddressElement.textContent = `${appState.walletAddress.substring(0, 4)}...${appState.walletAddress.substring(appState.walletAddress.length - 4)}`;
  }
}

// Загрузка данных пользователя
async function loadUserData() {
  if (!appState.userId) return;
  
  try {
    // Проверяем существование пользователя
    let { data: userData } = await supabase
      .from('users')
      .select('cash, wallet_address')
      .eq('user_id', appState.userId)
      .single();

    // Если пользователя нет - создаем
    if (!userData) {
      const { data: newUser } = await supabase
        .from('users')
        .insert([{
          user_id: appState.userId,
          cash: 0,
          name: tg.initDataUnsafe?.user?.first_name || 'Новый пользователь'
        }])
        .select()
        .single();
      
      userData = newUser;
    }

    if (userData) {
      appState.balance = userData.cash || 0;
      appState.walletAddress = userData.wallet_address || null;
      updateUI();
    }
  } catch (error) {
    console.error("Ошибка загрузки данных:", error);
    throw error;
  }
}

// Инициализация заданий пользователя
async function initUserTasks() {
  if (!appState.userId) return false;

  try {
    await syncUserTasks();
    return true;
  } catch (error) {
    console.error("Ошибка инициализации заданий:", error);
    throw error;
  }
}

// Синхронизация заданий пользователя
async function syncUserTasks() {
  try {
    const { data: allTasks } = await supabase.from('tasks').select('*');
    const { data: userTasks } = await supabase
      .from('user_tasks')
      .select('*')
      .eq('user_id', appState.userId);

    const existingTaskIds = userTasks?.map(t => t.task_id) || [];
    const tasksToAdd = allTasks
      ?.filter(task => !existingTaskIds.includes(task.task_id))
      .map(task => ({
        user_id: appState.userId,
        task_id: task.task_id,
        access: 0,
        completed: 0
      })) || [];

    if (tasksToAdd.length > 0) {
      await supabase.from('user_tasks').insert(tasksToAdd);
    }

    appState.userTasks = [...(userTasks || []), ...tasksToAdd];
    return true;
  } catch (error) {
    console.error("Ошибка синхронизации:", error);
    throw error;
  }
}

// Загрузка заданий
async function loadTasks() {
  try {
    const { data: allTasks, error } = await supabase
      .from('tasks')
      .select('*')
      .order('task_id', { ascending: true });

    if (error) throw error;

    const groupedTasks = {};
    const userTaskMap = new Map(
      appState.userTasks.map(task => [task.task_id, task])
    );

    allTasks?.forEach(task => {
      if (!task?.task_id) return;
      
      const [blockId] = task.task_id.split('-');
      if (!blockId) return;

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
    });

    appState.tasks = Object.values(groupedTasks).filter(block => {
      const hasAccess = block.tasks.some(task => {
        const userTask = userTaskMap.get(task.task_id);
        return userTask?.access === 1;
      });

      const allCompleted = block.tasks.every(task => {
        const userTask = userTaskMap.get(task.task_id);
        return userTask?.completed === 1;
      });

      return !allCompleted;
    });
    
    renderTasks();
    return true;
  } catch (error) {
    console.error("Ошибка загрузки заданий:", error);
    throw error;
  }
}

// Отрисовка заданий
function renderTasks() {
  const tasksContainer = document.querySelector('#home-page .cover-2');
  if (!tasksContainer) return;

  tasksContainer.innerHTML = '';

  appState.tasks.forEach((taskBlock, blockIndex) => {
    if (!taskBlock || !taskBlock.tasks) return;

    const taskCard = document.createElement('div');
    taskCard.className = 'task-card';
    
    taskCard.innerHTML = `
      <div class="inner-2">
        <div class="frame-6">
          <button class="btn"><div class="text-wrapper-3">X2 доход</div></button>
          <button class="btn"><div class="text-wrapper-3">Комьюнити</div></button>
          <button class="btn"><div class="text-wrapper-3">Доп задание</div></button>
          <button class="btn"><div class="text-wrapper-3">5 заданий</div></button>
        </div>
        <div class="coin-balance-2">БЛОК ${blockIndex + 1}</div>
        <div class="frame-7">
          <div class="card-title">Стоимость</div>
          <p class="p"><span class="span">${taskBlock.price} </span> <span class="text-wrapper-4">AVVA</span></p>
        </div>
        <div class="frame-7">
          <div class="card-title">Награда</div>
          <p class="coin-balance">${taskBlock.reward} AVVA</p>
        </div>
        <div class="frame-8">
          <button class="div-wrapper" onclick="showConfirmAvvaModal(${taskBlock.price}, ${taskBlock.reward}, '${taskBlock.blockId}')">
            <div class="text-wrapper-5">Начать</div>
          </button>
        </div>
      </div>
    `;

    tasksContainer.appendChild(taskCard);
  });
}

// Таймеры заданий
function startTaskTimer(taskId, duration = 60000, callback) {
  if (appState.activeTimers[taskId]) {
    clearTimeout(appState.activeTimers[taskId]);
  }

  appState.timerStartTimes[taskId] = Date.now();
  saveTimersToStorage();

  appState.activeTimers[taskId] = setTimeout(() => {
    clearTimer(taskId);
    if (callback) callback();
  }, duration);
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
      const [blockId] = taskId.split('-');
      appState.activeTimers[taskId] = setTimeout(() => {
        completeTask(taskId, blockId);
      }, remaining);
    } else {
      const [blockId] = taskId.split('-');
      completeTask(taskId, blockId);
    }
  }
}

// Работа с командами
async function loadTeams() {
  try {
    const { data, error } = await supabase
      .from('teams')
      .select('team_id, score')
      .order('score', { ascending: false });

    if (error) throw error;
    if (data) appState.teams = data;
  } catch (error) {
    console.error("Ошибка загрузки команд:", error);
    throw error;
  }
}

// Рейтинги
async function loadAllRatings() {
  try {
    const [
      { data: cashData, error: cashError },
      { data: tasksData, error: tasksError },
      { data: topTeams, error: teamsError }
    ] = await Promise.all([
      supabase
        .from('users')
        .select('user_id, cash, name')
        .order('cash', { ascending: false })
        .limit(10),
      supabase
        .from('users')
        .select('user_id, countoftasks, name')
        .order('countoftasks', { ascending: false })
        .limit(10),
      supabase
        .from('teams')
        .select('team_id, members')
        .order('members', { ascending: false })
        .limit(10)
    ]);

    if (cashError) throw cashError;
    if (tasksError) throw tasksError;
    if (teamsError) throw teamsError;

    let invitesData = [];
    if (topTeams && topTeams.length > 0) {
      const captainIds = topTeams.map(team => team.team_id);
      const { data: captainsData, error: captainsError } = await supabase
        .from('users')
        .select('user_id, name')
        .in('user_id', captainIds);
      
      if (captainsError) throw captainsError;

      invitesData = topTeams.map(team => {
        const captain = captainsData?.find(c => c.user_id === team.team_id) || {};
        return {
          user_id: team.team_id,
          name: captain.name || `Капитан ${team.team_id}`,
          members: team.members
        };
      });
    }
    
    if (cashData) appState.ratings.cash = cashData;
    if (tasksData) appState.ratings.tasks = tasksData;
    appState.ratings.invites = invitesData;
    
    renderRatings();
  } catch (error) {
    console.error("Ошибка загрузки рейтингов:", error);
    throw error;
  }
}

// Отрисовка рейтингов
function renderRatings() {
  const cashRatingElement = document.getElementById('cash-rating');
  if (!cashRatingElement) return;

  cashRatingElement.innerHTML = '';
  
  appState.ratings.cash.slice(0, 5).forEach((user, index) => {
    const userElement = document.createElement('div');
    userElement.className = 'p';
    userElement.innerHTML = `
      <span class="span">${index + 1}. ${user.name}</span>
      <span> - ${user.cash} AVVA</span>
    `;
    cashRatingElement.appendChild(userElement);
  });
}

// Модальные окна
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
  tg.HapticFeedback.impactOccurred('light');
}

function showSuccess(message) {
  const modal = document.getElementById('successModal');
  const textElement = document.getElementById('successText');
  if (modal && textElement) {
    textElement.textContent = message;
    modal.classList.add('active');
    tg.HapticFeedback.impactOccurred('light');
  }
}

function showError(message) {
  const modal = document.getElementById('errorModal');
  const textElement = document.getElementById('errorText');
  if (modal && textElement) {
    textElement.textContent = message;
    modal.classList.add('active');
    tg.HapticFeedback.impactOccurred('heavy');
  }
}

function showConfirmAvvaModal(price, reward, blockId) {
  const modal = document.getElementById('confirmAvvaModal');
  const textElement = document.getElementById('confirmAvvaText');
  const button = document.getElementById('confirmAvvaBtn');
  
  if (!modal || !textElement || !button) return;

  textElement.innerHTML = `Вы уверены, что хотите потратить <strong>${price} AVVA</strong> для доступа к заданиям?<br><br>Награда: <strong>${reward} AVVA</strong>`;
  
  button.onclick = async function() {
    if (appState.balance < price) {
      showError(`Недостаточно AVVA. Нужно: ${price}`);
      closeModal('confirmAvvaModal');
      return;
    }
    
    try {
      // Обновляем баланс локально
      appState.balance -= price;
      updateUI();
      
      // Обновляем баланс в базе данных
      const { error } = await supabase
        .from('users')
        .update({ cash: appState.balance })
        .eq('user_id', appState.userId);
      
      if (error) throw error;
      
      // Открываем доступ к заданиям
      await updateTaskAccess(blockId);
      
      // Перезагружаем задания
      await loadTasks();
      
      showSuccess(`Списано ${price} AVVA. Доступ к заданиям открыт.`);
      closeModal('confirmAvvaModal');
    } catch (error) {
      console.error("Ошибка:", error);
      // Откатываем изменения баланса при ошибке
      appState.balance += price;
      updateUI();
      showError("Ошибка при начале задания");
      closeModal('confirmAvvaModal');
    }
  };
  
  modal.classList.add('active');
  tg.HapticFeedback.impactOccurred('light');
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
      
      // Обновляем локальное состояние
      appState.userTasks = appState.userTasks.map(task => {
        if (taskIds.includes(task.task_id)) {
          return { ...task, access: 1 };
        }
        return task;
      });
    }
  } catch (error) {
    console.error("Ошибка обновления доступа:", error);
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
    
    // Обновляем локальное состояние
    appState.userTasks = appState.userTasks.map(task => {
      if (task.task_id === taskId) {
        return { ...task, completed: 1 };
      }
      return task;
    });

    const block = appState.tasks.find(b => b.blockId === blockId);
    if (!block) return;

    // Проверяем, все ли задания в блоке выполнены
    const allCompleted = block.tasks.every(t => {
      const userTask = appState.userTasks.find(ut => ut.task_id === t.task_id);
      return userTask?.completed === 1;
    });

    if (allCompleted && block.reward > 0) {
      // Начисляем награду
      appState.balance += block.reward;
      updateUI();

      const { error: balanceError } = await supabase
        .from('users')
        .update({ cash: appState.balance })
        .eq('user_id', appState.userId);
      
      if (balanceError) throw balanceError;

      showSuccess(`Вы выполнили все задания и получили ${block.reward} AVVA!`);
      await loadTasks();
    }
  } catch (error) {
    console.error("Ошибка выполнения задания:", error);
    throw error;
  }
}

// Реферальная система
function showReferralModal() {
  if (!appState.userId) {
    showError("Не удалось получить ID пользователя");
    return;
  }

  appState.referralLink = `https://t.me/testwebappaoao_bot?start=${appState.userId}`;
  
  const modal = document.getElementById('referralModal');
  const linkInput = document.getElementById('referralLink');
  if (modal && linkInput) {
    linkInput.value = appState.referralLink;
    modal.classList.add('active');
    tg.HapticFeedback.impactOccurred('light');
  }
}

function copyReferralLink() {
  if (!appState.referralLink) return;
  
  navigator.clipboard.writeText(appState.referralLink)
    .then(() => showSuccess("Ссылка скопирована"))
    .catch(err => {
      console.error("Ошибка копирования:", err);
      showError("Не удалось скопировать ссылку");
    });
}

function shareToTelegram() {
  if (!appState.referralLink) return;
  
  const url = `https://t.me/share/url?url=${encodeURIComponent(appState.referralLink)}&text=Присоединяйся к игре AVVA!`;
  window.open(url, '_blank');
}

// Навигация по вкладкам
function switchTab(tabName) {
  // Скрываем все страницы
  document.querySelectorAll('.page').forEach(page => {
    page.classList.remove('active');
  });

  // Показываем выбранную страницу
  const activePage = document.getElementById(`${tabName}-page`);
  if (activePage) activePage.classList.add('active');

  // Обновляем навигационную панель
  document.querySelectorAll('.tab-2, .tab-3').forEach(tab => {
    tab.classList.remove('tab-2');
    tab.classList.add('tab-3');
  });

  const activeTab = document.querySelector(`[onclick="switchTab('${tabName}')"]`);
  if (activeTab) {
    activeTab.classList.remove('tab-3');
    activeTab.classList.add('tab-2');
  }

  // Обновляем заголовок страницы
  const pageTitle = document.getElementById('page-title');
  if (pageTitle) {
    const titles = {
      'home': 'Игра',
      'teams': 'Команды',
      'rating': 'Рейтинг',
      'market': 'Финансы'
    };
    pageTitle.textContent = titles[tabName] || 'Игра';
  }

  tg.HapticFeedback.impactOccurred('light');
}

// Инициализация приложения
document.addEventListener('DOMContentLoaded', initApp);