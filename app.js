(() => {
  "use strict";

  const STATUSES = ["todo", "doing", "done"];
  const STATUS_LABELS = { todo: "A Fazer", doing: "Em Andamento", done: "Concluído" };
  const STORAGE_PREFIX = "estudio-norte-kanban-v1:";
  const starterTasks = [
    { id: "sample-1", title: "Revisar briefing do projeto", description: "Alinhar objetivos e entregáveis com o time.", status: "todo", createdAt: new Date().toISOString() },
    { id: "sample-2", title: "Organizar referências visuais", description: "Separar inspirações para a primeira rodada.", status: "todo", createdAt: new Date().toISOString() },
    { id: "sample-3", title: "Desenhar fluxo de navegação", description: "Mapear os principais caminhos da experiência.", status: "doing", createdAt: new Date().toISOString() },
    { id: "sample-4", title: "Definir escopo inicial", description: "Registrar o que entra na primeira entrega.", status: "done", createdAt: new Date().toISOString() }
  ];
  const loginView = document.querySelector("#login-view");
  const appView = document.querySelector("#app-view");
  const loginForm = document.querySelector("#login-form");
  const usernameInput = document.querySelector("#username");
  const passwordInput = document.querySelector("#password");
  const loginButton = document.querySelector("#login-submit");
  const authFeedback = document.querySelector("#auth-feedback");
  const board = document.querySelector("#board");
  const dialog = document.querySelector("#task-dialog");
  const taskForm = document.querySelector("#task-form");
  const taskTitleInput = document.querySelector("#task-title-input");
  const taskDescriptionInput = document.querySelector("#task-description-input");
  const toast = document.querySelector("#toast");
  let currentUser = null;
  let tasks = [];
  let toastTimer;

  function setAuthFeedback(message = "", success = false) {
    authFeedback.textContent = message;
    authFeedback.classList.toggle("is-success", success);
  }

  function showLogin(message = "", success = false) {
    currentUser = null;
    tasks = [];
    loginView.hidden = false;
    appView.hidden = true;
    document.title = "Entrar | Estúdio Norte";
    setAuthFeedback(message, success);
  }

  function storageKey(username) {
    return STORAGE_PREFIX + username.trim().toLowerCase();
  }

  function loadTasks(username) {
    try {
      const saved = localStorage.getItem(storageKey(username));
      if (saved === null) return starterTasks.map((task) => ({ ...task }));
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((task) => task && typeof task.id === "string" && typeof task.title === "string" && STATUSES.includes(task.status));
    } catch {
      return starterTasks.map((task) => ({ ...task }));
    }
  }

  function persistTasks() {
    if (!currentUser) return;
    try { localStorage.setItem(storageKey(currentUser), JSON.stringify(tasks)); }
    catch { showToast("Não foi possível salvar neste navegador."); }
  }

  function enterApp(username) {
    currentUser = username;
    tasks = loadTasks(username);
    document.querySelector("#user-name").textContent = username;
    loginView.hidden = true;
    appView.hidden = false;
    document.title = "Meu quadro | Estúdio Norte";
    setAuthFeedback();
    render();
  }

  async function restoreSession() {
    try {
      const response = await fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) { showLogin(); return; }
      const session = await response.json();
      if (typeof session.username === "string" && session.username) enterApp(session.username);
      else showLogin();
    } catch {
      showLogin("Não foi possível conectar ao servidor de autenticação.");
    }
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Adicionada recentemente";
    return new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" }).format(date);
  }

  function createTaskCard(task) {
    const card = createElement("article", "task-card");
    card.draggable = true;
    card.tabIndex = 0;
    card.dataset.taskId = task.id;
    card.setAttribute("role", "listitem");
    card.setAttribute("aria-label", `${task.title}. Use as setas esquerda e direita para mover entre colunas.`);
    const top = createElement("div", "task-card-top");
    top.append(createElement("h3", "task-title", task.title), createElement("span", "drag-mark", "⋮⋮"));
    top.lastElementChild.setAttribute("aria-hidden", "true");
    card.append(top);
    if (task.description) card.append(createElement("p", "task-description", task.description));
    const footer = createElement("div", "task-footer");
    footer.append(createElement("span", "task-date", formatDate(task.createdAt)));
    const actions = createElement("div", "task-actions");
    const status = document.createElement("select");
    status.className = "task-status";
    status.setAttribute("aria-label", `Mover ${task.title}`);
    STATUSES.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = STATUS_LABELS[value];
      option.selected = value === task.status;
      status.append(option);
    });
    const remove = createElement("button", "delete-button", "×");
    remove.type = "button";
    remove.setAttribute("aria-label", `Excluir ${task.title}`);
    remove.title = "Excluir tarefa";
    actions.append(status, remove);
    footer.append(actions);
    card.append(footer);
    return card;
  }

  function render() {
    const counts = { todo: 0, doing: 0, done: 0 };
    STATUSES.forEach((status) => {
      const list = board.querySelector(`[data-list="${status}"]`);
      list.replaceChildren();
      const matching = tasks.filter((task) => task.status === status);
      counts[status] = matching.length;
      matching.forEach((task) => list.append(createTaskCard(task)));
      if (!matching.length) list.append(createElement("div", "empty-state", "Nenhuma tarefa por aqui"));
      board.querySelector(`[data-count="${status}"]`).textContent = String(matching.length);
    });
    const total = tasks.length;
    document.querySelector("#total-count").textContent = `${total} ${total === 1 ? "tarefa" : "tarefas"}`;
    document.querySelector("#progress-summary").textContent = total === 0
      ? "Tudo em ordem"
      : `${counts.done} de ${total} ${total === 1 ? "concluída" : "concluídas"}`;
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2400);
  }

  function moveTask(id, status) {
    if (!STATUSES.includes(status)) return;
    const task = tasks.find((item) => item.id === id);
    if (!task || task.status === status) return;
    task.status = status;
    persistTasks();
    render();
    showToast(`Tarefa movida para ${STATUS_LABELS[status]}.`);
  }

  document.querySelector("#current-date").textContent = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  }).format(new Date());

  document.querySelector("#toggle-password").addEventListener("click", (event) => {
    const button = event.currentTarget;
    const visible = passwordInput.type === "password";
    passwordInput.type = visible ? "text" : "password";
    button.textContent = visible ? "Ocultar" : "Mostrar";
    button.setAttribute("aria-label", visible ? "Ocultar senha" : "Mostrar senha");
    button.setAttribute("aria-pressed", String(visible));
    passwordInput.focus();
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!loginForm.reportValidity()) return;
    loginButton.disabled = true;
    loginButton.querySelector("span").textContent = "Verificando...";
    setAuthFeedback();
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ username: usernameInput.value.trim(), password: passwordInput.value })
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) {
        passwordInput.value = "";
        setAuthFeedback("E-mail/nome de usuário ou senha inválidos.");
        passwordInput.focus();
      } else if (!response.ok) {
        setAuthFeedback(result.message || "Não foi possível entrar. Tente novamente.");
      } else if (typeof result.username === "string" && result.username) {
        loginForm.reset();
        enterApp(result.username);
      } else {
        setAuthFeedback("Resposta inválida do servidor de autenticação.");
      }
    } catch {
      setAuthFeedback("Não foi possível conectar ao servidor de autenticação.");
    } finally {
      loginButton.disabled = false;
      loginButton.querySelector("span").textContent = "Entrar";
    }
  });

  document.querySelector("#logout-button").addEventListener("click", async () => {
    const button = document.querySelector("#logout-button");
    button.disabled = true;
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
      if (!response.ok) { showToast("Não foi possível encerrar a sessão. Tente novamente."); return; }
      showLogin("Você saiu da sua conta.", true);
      loginForm.reset();
    } catch {
      showToast("Não foi possível conectar ao servidor. A sessão continua ativa.");
    } finally {
      button.disabled = false;
    }
  });

  document.querySelector("#open-task-dialog").addEventListener("click", () => {
    taskForm.reset();
    dialog.showModal();
    taskTitleInput.focus();
  });
  document.querySelector("#close-task-dialog").addEventListener("click", () => dialog.close());
  document.querySelector("#cancel-task").addEventListener("click", () => dialog.close());
  taskForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const title = taskTitleInput.value.trim();
    if (!title) { taskTitleInput.focus(); return; }
    tasks.unshift({
      id: globalThis.crypto?.randomUUID?.() || `task-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title,
      description: taskDescriptionInput.value.trim(),
      status: "todo",
      createdAt: new Date().toISOString()
    });
    persistTasks();
    render();
    dialog.close();
    showToast("Tarefa adicionada ao quadro.");
  });

  board.addEventListener("click", (event) => {
    const button = event.target.closest(".delete-button");
    if (!button) return;
    const card = button.closest("[data-task-id]");
    tasks = tasks.filter((task) => task.id !== card.dataset.taskId);
    persistTasks();
    render();
    showToast("Tarefa excluída.");
  });
  board.addEventListener("change", (event) => {
    if (event.target.matches(".task-status")) moveTask(event.target.closest("[data-task-id]").dataset.taskId, event.target.value);
  });
  board.addEventListener("keydown", (event) => {
    if (!event.target.matches(".task-card") || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const task = tasks.find((item) => item.id === event.target.dataset.taskId);
    const nextIndex = STATUSES.indexOf(task.status) + (event.key === "ArrowRight" ? 1 : -1);
    if (STATUSES[nextIndex]) moveTask(task.id, STATUSES[nextIndex]);
  });
  board.addEventListener("dragstart", (event) => {
    const card = event.target.closest(".task-card");
    if (!card || !event.dataTransfer) return;
    event.dataTransfer.setData("text/plain", card.dataset.taskId);
    event.dataTransfer.effectAllowed = "move";
    card.classList.add("is-dragging");
  });
  board.addEventListener("dragend", (event) => {
    event.target.closest(".task-card")?.classList.remove("is-dragging");
    board.querySelectorAll(".kanban-column.is-over").forEach((column) => column.classList.remove("is-over"));
  });
  board.addEventListener("dragover", (event) => {
    const column = event.target.closest(".kanban-column");
    if (!column || !event.dataTransfer) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    column.classList.add("is-over");
  });
  board.addEventListener("dragleave", (event) => {
    const column = event.target.closest(".kanban-column");
    if (column && !column.contains(event.relatedTarget)) column.classList.remove("is-over");
  });
  board.addEventListener("drop", (event) => {
    const column = event.target.closest(".kanban-column");
    if (!column) return;
    event.preventDefault();
    column.classList.remove("is-over");
    moveTask(event.dataTransfer?.getData("text/plain"), column.dataset.status);
  });

  showLogin();
  restoreSession();
})();
