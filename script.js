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
  userId: tg.initDataUnsafe?.user?.id || Math.random().toString(36).substring(2, 9),
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
  isWalletConnected: false
};

// Основная функция инициализации
async function initApp() {
  try {
    updateUI();
    await Promise.all([
      loadUserData(),
      loadTeams(),
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
}

// Обновление интерфейса
function updateUI() {
  const balanceElement = document.getElementById("balance");
  if (balanceElement) balanceElement.textContent = appState.balance.toFixed(2) + " AVVA";
  
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
  if (walletAddressElement) {
    if (appState.walletAddress) {
      walletAddressElement.textContent = `${appState.walletAddress.substring(0, 4)}...${appState.walletAddress.substring(appState.walletAddress.length - 4)}`;
    } else {
      walletAddressElement.textContent = "Не подключен";
    }
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
  renderRatingList('cash-rating', appState.ratings.cash, 'cash');
  renderRatingList('tasks-rating', appState.ratings.tasks, 'countoftasks');
  renderRatingList('invites-rating', appState.ratings.invites, 'members');
}

function renderRatingList(elementId, data, valueField) {
  const container = document.getElementById(elementId);
  if (!container) return;
  
  container.innerHTML = '';
  
  if (!data || data.length === 0) {
    container.innerHTML = '<div class="card-title">Нет данных</div>';
    return;
  }
  
  data.forEach((user, index) => {
    const userElement = document.createElement('div');
    userElement.className = 'p';
    
    const userName = user.name || `Игрок ${user.user_id?.slice(0, 4) || '---'}`;
    const valueContent = elementId === 'invites-rating' 
      ? `${user[valueField] || 0} участников`
      : `${user[valueField] || 0} AVVA`;
    
    userElement.innerHTML = `
      <span class="span">${index + 1}. ${userName}</span>
      <span> - ${valueContent}</span>
    `;
    container.appendChild(userElement);
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
      'tasks': 'Задания',
      'teams': 'Команды',
      'rating': 'Рейтинг'
    };
    pageTitle.textContent = titles[tabName] || 'Игра';
  }

  tg.HapticFeedback.impactOccurred('light');
}

// Инициализация приложения
document.addEventListener('DOMContentLoaded', initApp);