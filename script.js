const tg = window.Telegram.WebApp;
tg.expand();
tg.enableClosingConfirmation();

const supabaseUrl = 'https://koqnqotxchpimovxcnva.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtvcW5xb3R4Y2hwaW1vdjhjbnZhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NTE3Mzk4MCwiZXhwIjoyMDYwNzQ5OTgwfQ.bFAEslvrVDE2i7En3Ln8_AbQPtgvH_gElnrBcPBcSMc';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

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

// Показываем загрузку при запуске
function showLoading(message = 'Загрузка...') {
  // Можно добавить реализацию при необходимости
}

function hideLoading() {
  // Можно добавить реализацию при необходимости
}

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
      .select('cash, wallet_address')
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
  const teamsContainer = document.getElementById('teams-container');
  if (!teamsContainer) return;

  teamsContainer.innerHTML = '';

  appState.teams.forEach((team, index) => {
    const teamCard = document.createElement('div');
    teamCard.className = 'task-card';
    
    teamCard.innerHTML = `
      <div class="inner-2">
        <div class="coin-balance-2">Команда #${team.team_id}</div>
        <div class="frame-7">
          <div class="card-title">Очки: ${team.score}</div>
        </div>
      </div>
    `;
    
    teamsContainer.appendChild(teamCard);
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

function renderAllRatings() {
  renderRatingList('cash-rating', appState.ratings.cash, 'cash');
  renderRatingList('tasks-rating', appState.ratings.tasks, 'countoftasks');
  renderRatingList('invites-rating', appState.ratings.invites, 'members');
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
    item.className = 'p';
    
    const userName = user.name || `Игрок ${user.user_id?.slice(0, 4) || '---'}`;
    const valueContent = elementId === 'invites-rating' 
      ? `${user[valueField] || 0} участников`
      : `${user[valueField] || 0}`;
    
    item.innerHTML = `<span class="span">${index + 1}. ${userName}</span> - ${valueContent}`;
    container.appendChild(item);
  });
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
    await loadTeams();
    await loadAllRatings();
    switchTab('home');
  } catch (error) {
    console.error("Ошибка инициализации:", error);
    showError("Ошибка загрузки приложения");
  }
}

document.addEventListener('DOMContentLoaded', initApp);