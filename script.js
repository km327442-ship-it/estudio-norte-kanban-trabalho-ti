import {
  auth,
  createUserWithEmailAndPassword,
  db,
  doc,
  firebaseConfigured,
  getDoc,
  onAuthStateChanged,
  serverTimestamp,
  setDoc,
  signInWithEmailAndPassword,
  signOut
} from "./firebase.js";

(() => {
  "use strict";

  const STATUSES = ["todo", "doing", "done"];
  const STATUS_LABELS = { todo: "A Fazer", doing: "Em Andamento", done: "Concluído" };
  const starterTasks = [
    { id: "sample-1", title: "Revisar briefing do projeto", description: "Alinhar objetivos e entregáveis com o time.", status: "todo", createdAt: new Date().toISOString() },
    { id: "sample-2", title: "Organizar referências visuais", description: "Separar inspirações para a primeira rodada.", status: "todo", createdAt: new Date().toISOString() },
    { id: "sample-3", title: "Desenhar fluxo de navegação", description: "Mapear os principais caminhos da experiência.", status: "doing", createdAt: new Date().toISOString() },
    { id: "sample-4", title: "Definir escopo inicial", description: "Registrar o que entra na primeira entrega.", status: "done", createdAt: new Date().toISOString() }
  ];
  const loginView = document.querySelector("#login-view");
  const appView = document.querySelector("#app-view");
  const loginPanel = document.querySelector("#login-panel");
  const registerPanel = document.querySelector("#register-panel");
  const loginForm = document.querySelector("#login-form");
  const usernameInput = document.querySelector("#username");
  const passwordInput = document.querySelector("#password");
  const loginButton = document.querySelector("#login-submit");
  const authFeedback = document.querySelector("#auth-feedback");
  const registerForm = document.querySelector("#register-form");
  const registerUsernameInput = document.querySelector("#register-username");
  const registerPasswordInput = document.querySelector("#register-password");
  const registerConfirmInput = document.querySelector("#register-confirm-password");
  const registerButton = document.querySelector("#register-submit");
  const registerFeedback = document.querySelector("#register-feedback");
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
    loginPanel.hidden = false;
    registerPanel.hidden = true;
    document.title = "Entrar | Estúdio Norte";
    setAuthFeedback(message, success);
    registerFeedback.textContent = "";
  }

  function showRegisterForm() {
    loginPanel.hidden = true;
    registerPanel.hidden = false;
    setAuthFeedback();
    registerFeedback.textContent = firebaseConfigured
      ? ""
      : "Conecte este app ao Firebase em firebase-config.js para criar uma conta.";
    registerUsernameInput.focus();
  }

  function showLoginForm() {
    registerPanel.hidden = true;
    loginPanel.hidden = false;
    registerFeedback.textContent = "";
    setAuthFeedback(firebaseConfigured ? "" : "Conecte este app ao Firebase em firebase-config.js para entrar.");
    usernameInput.focus();
  }

  function storageKey(username) {
    return doc(db, "users", username, "kanban", "state");
  }

  async function loadTasks(uid) {
    const boardDocument = storageKey(uid);
    const snapshot = await getDoc(boardDocument);
    if (snapshot.exists()) {
      const savedTasks = snapshot.data().tasks;
      return Array.isArray(savedTasks)
        ? savedTasks.filter((task) => task && typeof task.id === "string" && typeof task.title === "string" && STATUSES.includes(task.status))
        : [];
    }

    const initialTasks = starterTasks.map((task) => ({ ...task }));
    await setDoc(boardDocument, { tasks: initialTasks, updatedAt: serverTimestamp() });
    return initialTasks;
  }

  async function persistTasks() {
    if (!currentUser || !db) return false;
    try {
      await setDoc(storageKey(currentUser.uid), { tasks, updatedAt: serverTimestamp() });
      return true;
    } catch {
      showToast("Não foi possível salvar no Firestore.");
      return false;
    }
  }

  async function enterApp(user) {
    currentUser = user;
    document.querySelector("#user-name").textContent = user.email || user.uid;
    loginView.hidden = true;
    appView.hidden = false;
    document.title = "Meu quadro | Estúdio Norte";
    setAuthFeedback();
    try {
      tasks = await loadTasks(user.uid);
      render();
    } catch {
      tasks = [];
      render();
      showToast("Não foi possível carregar o quadro. Confira as regras do Firestore.");
    }
  }

  function authErrorMessage(error, action) {
    if (error.code === "auth/email-already-in-use") return "Este e-mail já possui uma conta. Entre com ela.";
    if (error.code === "auth/invalid-email") return "Informe um endereço de e-mail válido.";
    if (error.code === "auth/invalid-credential" || error.code === "auth/user-not-found" || error.code === "auth/wrong-password") return "E-mail ou senha inválidos.";
    if (error.code === "auth/weak-password") return "A senha deve ter pelo menos 6 caracteres.";
    if (error.code === "auth/operation-not-allowed") return "Ative o método E-mail/senha no Firebase Authentication.";
    if (error.code === "auth/too-many-requests") return "Muitas tentativas. Aguarde e tente novamente.";
    if (error.code === "auth/network-request-failed") return "Sem conexão com o Firebase. Verifique a rede e tente novamente.";
    if (error.code === "permission-denied" || error.code === "firestore/permission-denied") return "Acesso negado pelo Firestore. Confira as regras publicadas.";
    return action === "register" ? "Não foi possível criar a conta. Confira a configuração do Firebase." : "Não foi possível entrar. Confira a configuração do Firebase.";
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

  async function moveTask(id, status) {
    if (!STATUSES.includes(status)) return;
    const task = tasks.find((item) => item.id === id);
    if (!task || task.status === status) return;
    task.status = status;
    const saved = await persistTasks();
    render();
    if (saved) showToast(`Tarefa movida para ${STATUS_LABELS[status]}.`);
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
      await signInWithEmailAndPassword(auth, usernameInput.value.trim(), passwordInput.value);
      loginForm.reset();
    } catch (error) {
      setAuthFeedback(authErrorMessage(error, "login"));
    } finally {
      loginButton.disabled = false;
      loginButton.querySelector("span").textContent = "Entrar";
    }
  });

  document.querySelector("#show-register").addEventListener("click", showRegisterForm);
  document.querySelector("#show-login").addEventListener("click", showLoginForm);

  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!registerForm.reportValidity()) return;
    if (registerPasswordInput.value !== registerConfirmInput.value) {
      registerFeedback.textContent = "As senhas não coincidem.";
      registerConfirmInput.focus();
      return;
    }

    if (!firebaseConfigured) {
      registerFeedback.textContent = "Configure firebase-config.js antes de criar uma conta.";
      return;
    }

    registerButton.disabled = true;
    registerButton.querySelector("span").textContent = "Criando conta...";
    registerFeedback.textContent = "";
    try {
      await createUserWithEmailAndPassword(auth, registerUsernameInput.value.trim(), registerPasswordInput.value);
      registerForm.reset();
    } catch (error) {
      registerFeedback.textContent = authErrorMessage(error, "register");
    } finally {
      registerButton.disabled = false;
      registerButton.querySelector("span").textContent = "Criar conta";
    }
  });

  document.querySelector("#logout-button").addEventListener("click", async () => {
    const button = document.querySelector("#logout-button");
    button.disabled = true;
    try {
      await signOut(auth);
      loginForm.reset();
      registerForm.reset();
    } catch {
      showToast("Não foi possível encerrar a sessão. Tente novamente.");
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
  taskForm.addEventListener("submit", async (event) => {
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
    const saved = await persistTasks();
    render();
    dialog.close();
    if (saved) showToast("Tarefa adicionada ao quadro.");
  });

  board.addEventListener("click", async (event) => {
    const button = event.target.closest(".delete-button");
    if (!button) return;
    const card = button.closest("[data-task-id]");
    tasks = tasks.filter((task) => task.id !== card.dataset.taskId);
    await persistTasks();
    render();
    showToast("Tarefa excluída.");
  });
  board.addEventListener("change", (event) => {
    if (event.target.matches(".task-status")) void moveTask(event.target.closest("[data-task-id]").dataset.taskId, event.target.value);
  });
  board.addEventListener("keydown", (event) => {
    if (!event.target.matches(".task-card") || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const task = tasks.find((item) => item.id === event.target.dataset.taskId);
    const nextIndex = STATUSES.indexOf(task.status) + (event.key === "ArrowRight" ? 1 : -1);
    if (STATUSES[nextIndex]) void moveTask(task.id, STATUSES[nextIndex]);
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
    void moveTask(event.dataTransfer?.getData("text/plain"), column.dataset.status);
  });

  showLogin();
  if (!firebaseConfigured) {
    const setupMessage = "Conecte este app ao Firebase em firebase-config.js para entrar.";
    setAuthFeedback(setupMessage);
    registerFeedback.textContent = setupMessage;
    loginButton.disabled = true;
    registerButton.disabled = true;
  } else {
    onAuthStateChanged(auth, (user) => {
      if (user) void enterApp(user);
      else showLogin();
    });
  }
})();
