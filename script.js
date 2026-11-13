import {
  addDoc,
  auth,
  collection,
  createUserWithEmailAndPassword,
  db,
  deleteDoc,
  doc,
  firebaseConfigured,
  getDoc,
  isSignInWithEmailLink,
  onAuthStateChanged,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  sendSignInLinkToEmail,
  setDoc,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  signOut,
  updateDoc,
  updateProfile,
  writeBatch
} from "./firebase.js";

(() => {
  "use strict";

  const STATUSES = ["todo", "doing", "done"];
  const STATUS_LABELS = { todo: "A Fazer", doing: "Em Andamento", done: "Concluído" };
  const PRIORITY_LABELS = { low: "Baixa", normal: "Normal", high: "Alta" };
  const BOARD_ID = "quadro-principal";
  const BOARD_PATH = `/board/${BOARD_ID}`;
  const loginView = document.querySelector("#login-view");
  const appView = document.querySelector("#app-view");
  const loginPanel = document.querySelector("#login-panel");
  const registerPanel = document.querySelector("#register-panel");
  const loginForm = document.querySelector("#login-form");
  const usernameInput = document.querySelector("#username");
  const passwordInput = document.querySelector("#password");
  const loginButton = document.querySelector("#login-submit");
  const showRegisterButton = document.querySelector("#show-register");
  const showLoginButton = document.querySelector("#show-login");
  const authFeedback = document.querySelector("#auth-feedback");
  const registerForm = document.querySelector("#register-form");
  const registerUsernameInput = document.querySelector("#register-username");
  const registerDisplayNameInput = document.querySelector("#register-display-name");
  const registerPasswordInput = document.querySelector("#register-password");
  const registerConfirmInput = document.querySelector("#register-confirm-password");
  const registerButton = document.querySelector("#register-submit");
  const registerFeedback = document.querySelector("#register-feedback");
  const board = document.querySelector("#board");
  const dialog = document.querySelector("#task-dialog");
  const taskForm = document.querySelector("#task-form");
  const taskTitleInput = document.querySelector("#task-title-input");
  const taskDescriptionInput = document.querySelector("#task-description-input");
  const taskPriorityInput = document.querySelector("#task-priority-input");
  const taskAssigneeInput = document.querySelector("#task-assignee-input");
  const taskDueDateInput = document.querySelector("#task-due-date-input");
  const toast = document.querySelector("#toast");
  const taskDetailView = document.querySelector("#task-detail-view");
  const taskCommentsList = document.querySelector("#task-comments");
  const activityList = document.querySelector("#task-activity");
  const commentForm = document.querySelector("#comment-form");
  const commentInput = document.querySelector("#comment-input");
  const mentionSuggestions = document.querySelector("#mention-suggestions");
  const memberList = document.querySelector("#member-list");
  const notificationList = document.querySelector("#notification-list");
  const inviteForm = document.querySelector("#invite-form");
  const inviteEmailInput = document.querySelector("#invite-email");
  const inviteRoleInput = document.querySelector("#invite-role");
  const inviteFeedback = document.querySelector("#invite-feedback");
  const inviteButton = document.querySelector("#invite-submit");
  let currentUser = null;
  let currentMember = null;
  let editingTaskId = null;
  let tasks = [];
  let members = [];
  let notifications = [];
  let activeComments = [];
  let activeActivity = [];
  let boardActivity = [];
  let activeDetailTaskId = null;
  let toastTimer;
  let unsubscribeTasks = null;
  let unsubscribeBoardActivity = null;
  let unsubscribeMembers = null;
  let unsubscribeNotifications = null;
  let unsubscribeComments = null;
  let unsubscribeActivity = null;

  function boardRef() { return doc(db, "boards", BOARD_ID); }
  function membersRef() { return collection(db, "boards", BOARD_ID, "members"); }
  function tasksRef() { return collection(db, "boards", BOARD_ID, "tasks"); }
  function memberRef(uid) { return doc(db, "boards", BOARD_ID, "members", uid); }
  function invitationRef(email) { return doc(db, "boards", BOARD_ID, "invitations", email.trim().toLowerCase()); }
  function canEdit() { return ["owner", "admin", "editor"].includes(currentMember?.role); }
  function isAdmin() { return ["owner", "admin"].includes(currentMember?.role); }
  function getRoute() {
    const match = window.location.pathname.match(/^\/board\/([^/]+)(?:\/task\/([^/]+))?\/?$/);
    if (!match || match[1] !== BOARD_ID) return { taskId: null };
    return { taskId: match[2] || null };
  }

  function stopListeners() {
    [unsubscribeTasks, unsubscribeBoardActivity, unsubscribeMembers, unsubscribeNotifications, unsubscribeComments, unsubscribeActivity]
      .forEach((unsubscribe) => unsubscribe?.());
    unsubscribeTasks = null;
    unsubscribeBoardActivity = null;
    unsubscribeMembers = null;
    unsubscribeNotifications = null;
    unsubscribeComments = null;
    unsubscribeActivity = null;
    activeDetailTaskId = null;
  }

  function setAuthFeedback(message = "", success = false) {
    authFeedback.textContent = message;
    authFeedback.classList.toggle("is-success", success);
  }

  function showLogin(message = "", success = false) {
    stopListeners();
    currentUser = null;
    currentMember = null;
    tasks = [];
    members = [];
    notifications = [];
    boardActivity = [];
    activeComments = [];
    activeActivity = [];
    loginView.hidden = false;
    appView.hidden = true;
    taskDetailView.hidden = true;
    taskDetailView.replaceChildren();
    loginPanel.hidden = false;
    registerPanel.hidden = true;
    document.title = "Entrar | Estúdio Norte";
    loginButton.disabled = !firebaseConfigured;
    registerButton.disabled = !firebaseConfigured;
    showRegisterButton.disabled = false;
    showLoginButton.disabled = false;
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

  function memberProfile(user, role) {
    const displayName = user.displayName || user.email?.split("@")[0] || "Usuário";
    const handle = makeHandle(user);
    return { uid: user.uid, email: user.email?.toLowerCase() || "", role, displayName, handle, photoURL: user.photoURL || "", joinedAt: serverTimestamp() };
  }

  function makeHandle(user) {
    const base = (user.email?.split("@")[0] || "membro").toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 24);
    return `${base || "membro"}-${user.uid.slice(0, 5).toLowerCase()}`;
  }

  async function ensureBoardMembership(user) {
    const email = user.email?.trim().toLowerCase() || "";
    const [boardSnapshot, memberSnapshot, invitationSnapshot] = await Promise.all([
      getDoc(boardRef()),
      getDoc(memberRef(user.uid)),
      email ? getDoc(invitationRef(email)) : Promise.resolve(null)
    ]);
    const invitation = invitationSnapshot?.exists() ? invitationSnapshot.data() : null;
    const validInvite = user.emailVerified
      && invitation?.email === email
      && ["owner", "editor", "reader"].includes(invitation.role)
      && !invitation.acceptedBy;
    const profileUpdates = {
      email,
      displayName: user.displayName || user.email?.split("@")[0] || "Usuário",
      handle: makeHandle(user),
      photoURL: user.photoURL || ""
    };
    if (memberSnapshot.exists()) {
      if (validInvite) {
        const batch = writeBatch(db);
        batch.update(memberRef(user.uid), { ...profileUpdates, role: invitation.role });
        batch.update(invitationRef(email), { acceptedBy: user.uid, acceptedAt: serverTimestamp() });
        await batch.commit();
      } else {
        await updateDoc(memberRef(user.uid), profileUpdates);
      }
      return;
    }

    if (!boardSnapshot.exists()) {
      const batch = writeBatch(db);
      batch.set(boardRef(), { name: "Meu quadro colaborativo", createdBy: user.uid, createdAt: serverTimestamp() });
      batch.set(memberRef(user.uid), memberProfile(user, "owner"));
      try {
        await batch.commit();
        return;
      } catch (error) {
        const [boardAfterRace, memberAfterRace] = await Promise.all([getDoc(boardRef()), getDoc(memberRef(user.uid))]);
        if (!boardAfterRace.exists()) throw error;
        if (memberAfterRace.exists()) return;
      }
    }

    if (validInvite) {
      const batch = writeBatch(db);
      batch.set(memberRef(user.uid), memberProfile(user, invitation.role));
      batch.update(invitationRef(email), { acceptedBy: user.uid, acceptedAt: serverTimestamp() });
      await batch.commit();
      return;
    }

    throw Object.assign(new Error("Este quadro só pode ser acessado por convite."), { code: "board/invite-required" });
  }

  function subscribeToBoard(user) {
    stopListeners();
    const route = getRoute();
    loginView.hidden = true;
    appView.hidden = false;
    taskDetailView.hidden = !route.taskId;
    appView.hidden = Boolean(route.taskId);
    document.title = route.taskId ? "Tarefa | Meu quadro" : "Meu quadro | Estúdio Norte";

    unsubscribeMembers = onSnapshot(membersRef(), (snapshot) => {
      members = snapshot.docs.map((entry) => ({ uid: entry.id, ...entry.data() }));
      currentMember = members.find((item) => item.uid === user.uid) || null;
      updateRoleControls();
      render();
      renderCurrentRoute();
    }, () => showToast("Não foi possível carregar os membros do quadro."));

    unsubscribeTasks = onSnapshot(query(tasksRef(), orderBy("createdAt", "desc")), (snapshot) => {
      tasks = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
      render();
      renderCurrentRoute();
    }, () => showToast("Não foi possível carregar tarefas. Confira as regras do Firestore."));

    unsubscribeBoardActivity = onSnapshot(query(collection(db, "boards", BOARD_ID, "activity"), orderBy("createdAt", "desc")), (snapshot) => {
      boardActivity = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
      renderBoardActivity();
    }, () => showToast("Não foi possível carregar a atividade recente."));

    unsubscribeNotifications = onSnapshot(collection(db, "users", user.uid, "notifications"), (snapshot) => {
      notifications = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }))
        .sort((left, right) => (right.createdAt?.toMillis?.() || 0) - (left.createdAt?.toMillis?.() || 0));
      renderNotifications();
    }, () => showToast("Não foi possível carregar as notificações."));

    if (route.taskId) watchTaskDetails(route.taskId);
  }

  async function enterApp(user) {
    currentUser = user;
    document.querySelector("#user-name").textContent = user.displayName || user.email || user.uid;
    setAuthFeedback();
    try {
      await ensureBoardMembership(user);
      subscribeToBoard(user);
    } catch (error) {
      console.error("Falha ao inicializar o quadro Firestore", error);
      if (error?.code === "board/invite-required") {
        try { await signOut(auth); } catch {}
        showLogin("Este quadro é privado. Peça ao proprietário um convite para este e-mail.");
        return;
      }
      const code = error?.code || "erro-desconhecido";
      const message = code === "permission-denied"
        ? "Login válido, mas o Firestore negou acesso. Publique firestore.rules no projeto Firebase correto."
        : code === "unavailable"
          ? "O Firestore está indisponível. Confira a conexão e se o banco foi criado."
          : "Não foi possível abrir o quadro. Confira se o Firestore foi criado no projeto conectado.";
      showLogin(`${message} (${code})`);
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
    if (error.code === "auth/configuration-not-found") return "Ative E-mail/senha no Firebase Authentication.";
    return action === "register" ? "Não foi possível criar a conta. Confira a configuração do Firebase." : "Não foi possível entrar. Confira a configuração do Firebase.";
  }

  async function completeEmailLinkSignIn() {
    if (!isSignInWithEmailLink(auth, window.location.href)) return false;
    let email = localStorage.getItem("kanban-email-link");
    if (!email) email = window.prompt("Confirme o e-mail que recebeu o convite:") || "";
    if (!email) throw new Error("É necessário informar o e-mail do convite.");

    await signInWithEmailLink(auth, email.trim().toLowerCase(), window.location.href);
    localStorage.removeItem("kanban-email-link");
    history.replaceState({}, "", BOARD_PATH);
    return true;
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function formatDate(value) {
    const date = value?.toDate?.() || new Date(value);
    if (Number.isNaN(date.getTime())) return "Adicionada recentemente";
    return new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
  }

  function formatDueDate(value) {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day, 12);
    return new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", year: "numeric" }).format(date);
  }

  function createAvatar(name, photoURL = "", extraClass = "") {
    const avatar = createElement("span", `avatar ${extraClass}`.trim());
    avatar.setAttribute("aria-hidden", "true");
    if (photoURL) {
      const image = document.createElement("img");
      image.src = photoURL;
      image.alt = "";
      image.referrerPolicy = "no-referrer";
      avatar.append(image);
    } else {
      avatar.textContent = (name || "?").trim().split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase();
    }
    return avatar;
  }

  function taskHref(taskId) {
    return `${BOARD_PATH}/task/${encodeURIComponent(taskId)}`;
  }

  function makeTaskLink(task) {
    const link = document.createElement("a");
    link.className = "task-title-link";
    link.href = taskHref(task.id);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.append(createElement("h3", "task-title", task.title));
    link.setAttribute("aria-label", `Abrir detalhes da tarefa: ${task.title} em nova aba`);
    return link;
  }

  function createTaskCard(task) {
    const card = createElement("article", `task-card${canEdit() ? " is-editable" : ""}`);
    card.draggable = canEdit();
    card.dataset.taskId = task.id;
    card.setAttribute("role", "listitem");
    const top = createElement("div", "task-card-top");
    top.append(makeTaskLink(task));
    const priority = createElement("span", `priority-tag priority-${task.priority || "normal"}`, PRIORITY_LABELS[task.priority] || PRIORITY_LABELS.normal);
    top.append(priority);
    card.append(top);
    if (task.description) card.append(createElement("p", "task-description", task.description));
    const assignee = members.find((member) => member.uid === task.assigneeUid);
    const assigneeRow = createElement("div", "task-assignee");
    if (assignee) {
      assigneeRow.append(createAvatar(assignee.displayName, assignee.photoURL));
      assigneeRow.append(createElement("span", "assignee-name", assignee.displayName || assignee.handle));
    } else {
      assigneeRow.append(createAvatar("?"), createElement("span", "assignee-name unassigned", "Sem responsável"));
    }
    card.append(assigneeRow);
    const footer = createElement("div", "task-footer");
    footer.append(createElement("span", "task-date", task.dueDate ? `Entrega ${formatDueDate(task.dueDate)}` : `Criada ${formatDate(task.createdAt)}`));
    const actions = createElement("div", "task-actions");
    if (canEdit()) {
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
      const edit = createElement("button", "icon-button edit-button", "Editar");
      edit.type = "button";
      edit.setAttribute("aria-label", `Editar ${task.title}`);
      edit.dataset.action = "edit";
      const remove = createElement("button", "delete-button", "×");
      remove.type = "button";
      remove.dataset.action = "delete";
      remove.setAttribute("aria-label", `Excluir ${task.title}`);
      remove.title = "Excluir tarefa";
      actions.append(status, edit, remove);
    } else {
      actions.append(createElement("span", "task-status-label", STATUS_LABELS[task.status] || STATUS_LABELS.todo));
    }
    footer.append(actions);
    card.append(footer);
    return card;
  }

  function updateRoleControls() {
    const roleLabel = { owner: "Proprietário", admin: "Proprietário", editor: "Editor", reader: "Leitor" }[currentMember?.role] || "Sem acesso";
    document.querySelector("#role-label").textContent = roleLabel;
    document.querySelector("#open-task-dialog").hidden = !canEdit();
    document.querySelector("#open-members-dialog").hidden = !isAdmin();
    document.querySelector("#notification-button").hidden = !currentUser;
    updateAssigneeOptions();
    renderMembers();
  }

  function updateAssigneeOptions() {
    if (!taskAssigneeInput) return;
    const previousValue = taskAssigneeInput.value;
    taskAssigneeInput.replaceChildren(new Option("Sem responsável", ""));
    members.forEach((member) => taskAssigneeInput.append(new Option(member.displayName || member.handle || member.uid, member.uid)));
    if ([...taskAssigneeInput.options].some((option) => option.value === previousValue)) taskAssigneeInput.value = previousValue;
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

  function renderMembers() {
    if (!memberList) return;
    memberList.replaceChildren();
    members.forEach((member) => {
      const row = createElement("div", "member-row");
      row.append(createAvatar(member.displayName, member.photoURL));
      const identity = createElement("div", "member-identity");
      identity.append(createElement("strong", "member-name", member.displayName || "Membro"));
      identity.append(createElement("span", "member-handle", `@${member.handle || member.uid.slice(0, 8)}`));
      row.append(identity);
      if (isAdmin() && member.uid !== currentUser.uid) {
        const roleSelect = document.createElement("select");
        roleSelect.className = "member-role-select";
        roleSelect.dataset.memberUid = member.uid;
        [["owner", "Proprietário"], ["editor", "Editor"], ["reader", "Leitor"]].forEach(([value, label]) => roleSelect.append(new Option(label, value)));
        roleSelect.value = member.role === "admin" ? "owner" : member.role || "reader";
        roleSelect.setAttribute("aria-label", `Permissão de ${member.displayName || member.handle}`);
        row.append(roleSelect);
      } else {
        row.append(createElement("span", "member-role", { owner: "Proprietário", admin: "Proprietário", editor: "Editor", reader: "Leitor" }[member.role] || "Leitor"));
      }
      memberList.append(row);
    });
  }

  function renderNotifications() {
    const unread = notifications.filter((notification) => !notification.read).length;
    document.querySelector("#notification-count").textContent = unread ? String(unread) : "";
    notificationList.replaceChildren();
    if (!notifications.length) notificationList.append(createElement("p", "empty-state", "Nenhuma notificação."));
    notifications.forEach((notification) => {
      const row = createElement("a", `notification-item${notification.read ? "" : " is-unread"}`);
      row.href = notification.taskId ? taskHref(notification.taskId) : BOARD_PATH;
      row.target = "_blank";
      row.rel = "noopener noreferrer";
      row.append(createElement("span", "notification-message", notification.message || "Atualização no quadro"));
      row.append(createElement("time", "notification-date", formatDate(notification.createdAt)));
      row.addEventListener("click", () => {
        if (!notification.read) void updateDoc(doc(db, "users", currentUser.uid, "notifications", notification.id), { read: true });
      });
      notificationList.append(row);
    });
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2400);
  }

  function taskRef(taskId) { return doc(db, "boards", BOARD_ID, "tasks", taskId); }
  function taskCommentsRef(taskId) { return collection(db, "boards", BOARD_ID, "tasks", taskId, "comments"); }
  function taskActivityRef(taskId) { return collection(db, "boards", BOARD_ID, "tasks", taskId, "activity"); }

  async function writeActivity(task, type, previousValue = null, newValue = null) {
    const activity = {
      boardId: BOARD_ID,
      taskId: task.id,
      taskTitle: task.title,
      actorUid: currentUser.uid,
      actorName: currentUser.displayName || currentUser.email || "Usuário",
      actorPhotoURL: currentUser.photoURL || "",
      type,
      previousValue,
      newValue,
      createdAt: serverTimestamp()
    };
    const writes = [addDoc(collection(db, "boards", BOARD_ID, "activity"), activity)];
    if (task.id) writes.push(addDoc(taskActivityRef(task.id), activity));
    await Promise.all(writes);
  }

  async function sendNotifications(userIds, type, task, message) {
    const recipients = [...new Set(userIds)].filter((uid) => uid && uid !== currentUser.uid);
    await Promise.all(recipients.map((uid) => addDoc(collection(db, "users", uid, "notifications"), {
      boardId: BOARD_ID,
      taskId: task.id,
      taskTitle: task.title,
      actorUid: currentUser.uid,
      actorName: currentUser.displayName || currentUser.email || "Usuário",
      type,
      message,
      read: false,
      createdAt: serverTimestamp()
    })));
  }

  async function updateTask(task, changes, activityType, previousValue, newValue, notice) {
    if (!canEdit()) return;
    await updateDoc(taskRef(task.id), { ...changes, updatedAt: serverTimestamp(), updatedBy: currentUser.uid });
    const updatedTask = { ...task, ...changes };
    await writeActivity(updatedTask, activityType, previousValue, newValue);
    if (notice) {
      const recipients = activityType === "assigned" ? [changes.assigneeUid] : members.map((member) => member.uid);
      await sendNotifications(recipients, activityType, updatedTask, notice);
    }
  }

  async function moveTask(id, status) {
    if (!canEdit() || !STATUSES.includes(status)) return;
    const task = tasks.find((item) => item.id === id);
    if (!task || task.status === status) return;
    try {
      await updateTask(task, { status }, "status_changed", task.status, status, `${task.title}: status alterado para ${STATUS_LABELS[status]}.`);
      showToast(`Tarefa movida para ${STATUS_LABELS[status]}.`);
    } catch {
      showToast("Não foi possível atualizar o status. Confira as permissões do quadro.");
    }
  }

  function setTaskRoute(taskId = null, replace = false) {
    const url = taskId ? taskHref(taskId) : BOARD_PATH;
    if (replace) history.replaceState({}, "", url);
    else history.pushState({}, "", url);
    renderCurrentRoute();
  }

  function openTaskEditor(task = null) {
    if (!canEdit()) return;
    editingTaskId = task?.id || null;
    taskForm.reset();
    document.querySelector("#dialog-title").textContent = task ? "Editar tarefa" : "Nova tarefa";
    taskForm.querySelector("button[type='submit']").textContent = task ? "Salvar alterações" : "Criar tarefa";
    taskTitleInput.value = task?.title || "";
    taskDescriptionInput.value = task?.description || "";
    taskPriorityInput.value = task?.priority || "normal";
    taskDueDateInput.value = task?.dueDate || "";
    updateAssigneeOptions();
    taskAssigneeInput.value = task?.assigneeUid || "";
    dialog.showModal();
    taskTitleInput.focus();
  }

  function renderMentionedText(container, text) {
    const mentionPattern = /@([a-z0-9._-]+)/gi;
    let cursor = 0;
    for (const match of text.matchAll(mentionPattern)) {
      const start = match.index;
      container.append(document.createTextNode(text.slice(cursor, start)));
      const mention = createElement("strong", "mention-text", `@${match[1]}`);
      container.append(mention);
      cursor = start + match[0].length;
    }
    container.append(document.createTextNode(text.slice(cursor)));
  }

  function renderTaskDetails(task) {
    taskDetailView.replaceChildren();
    const header = createElement("header", "detail-header");
    const back = createElement("a", "detail-back", "← Voltar ao quadro");
    back.href = BOARD_PATH;
    back.addEventListener("click", (event) => { event.preventDefault(); setTaskRoute(); });
    const copyLink = createElement("button", "secondary-button", "Copiar link");
    copyLink.type = "button";
    copyLink.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(new URL(taskHref(task.id), location.origin).href); showToast("Link copiado."); }
      catch { showToast("Não foi possível copiar o link neste navegador."); }
    });
    header.append(back, copyLink);
    const article = createElement("article", "detail-article");
    article.append(createElement("p", "eyebrow", "Tarefa do quadro"));
    article.append(createElement("h1", "detail-title", task.title));
    if (task.description) article.append(createElement("p", "detail-description", task.description));
    const details = createElement("div", "detail-meta");
    details.append(createElement("span", "detail-status", STATUS_LABELS[task.status] || STATUS_LABELS.todo));
    details.append(createElement("span", `priority-tag priority-${task.priority || "normal"}`, `Prioridade ${PRIORITY_LABELS[task.priority] || PRIORITY_LABELS.normal}`));
    const assignee = members.find((member) => member.uid === task.assigneeUid);
    details.append(createElement("span", "detail-assignee", assignee ? `Responsável: ${assignee.displayName}` : "Sem responsável"));
    if (task.dueDate) details.append(createElement("span", "detail-assignee", `Entrega: ${formatDueDate(task.dueDate)}`));
    article.append(details);
    if (canEdit()) {
      const edit = createElement("button", "primary-button", "Editar tarefa");
      edit.type = "button";
      edit.addEventListener("click", () => openTaskEditor(task));
      article.append(edit);
    }
    const commentsSection = createElement("section", "detail-section");
    commentsSection.append(createElement("h2", "section-title", `Comentários (${activeComments.length})`));
    commentsSection.append(taskCommentsList);
    commentsSection.append(commentForm);
    const activitySection = createElement("section", "detail-section");
    activitySection.append(createElement("h2", "section-title", "Histórico de atividade"), activityList);
    taskDetailView.append(header, article, commentsSection, activitySection);
    renderComments();
    renderActivity();
  }

  function renderComments() {
    taskCommentsList.replaceChildren();
    activeComments.forEach((comment) => {
      const row = createElement("article", "comment-item");
      const avatar = createAvatar(comment.authorName, comment.authorPhotoURL);
      const body = createElement("div", "comment-body");
      const header = createElement("div", "comment-header");
      header.append(createElement("strong", "comment-author", comment.authorName || "Usuário"));
      header.append(createElement("time", "comment-date", formatDate(comment.createdAt)));
      const content = createElement("p", "comment-content");
      renderMentionedText(content, comment.content || "");
      body.append(header, content);
      row.append(avatar, body);
      taskCommentsList.append(row);
    });
    commentForm.hidden = !canEdit();
    if (canEdit()) renderMentionSuggestions();
  }

  function renderMentionSuggestions() {
    if (!mentionSuggestions || !commentInput) return;
    const beforeCursor = commentInput.value.slice(0, commentInput.selectionStart);
    const match = beforeCursor.match(/(?:^|\s)@([a-z0-9._-]*)$/i);
    mentionSuggestions.replaceChildren();
    if (!match) { mentionSuggestions.hidden = true; return; }
    const prefix = match[1].toLowerCase();
    const suggestions = members.filter((member) => member.uid !== currentUser.uid && member.handle?.startsWith(prefix)).slice(0, 6);
    if (!suggestions.length) { mentionSuggestions.hidden = true; return; }
    suggestions.forEach((member) => {
      const option = createElement("button", "mention-option");
      option.type = "button";
      option.setAttribute("role", "option");
      option.append(createAvatar(member.displayName, member.photoURL, "avatar-small"));
      option.append(createElement("span", "mention-option-name", `${member.displayName} · @${member.handle}`));
      option.addEventListener("click", () => {
        const cursor = commentInput.selectionStart;
        const source = commentInput.value;
        const start = source.slice(0, cursor).search(/(?:^|\s)@[a-z0-9._-]*$/i);
        const insertionStart = start < 0 ? cursor : start + (source[start] === " " ? 1 : 0);
        const nextValue = `${source.slice(0, insertionStart)}@${member.handle} ${source.slice(cursor)}`;
        commentInput.value = nextValue;
        const nextCursor = insertionStart + member.handle.length + 2;
        commentInput.setSelectionRange(nextCursor, nextCursor);
        mentionSuggestions.hidden = true;
        commentInput.focus();
      });
      mentionSuggestions.append(option);
    });
    mentionSuggestions.hidden = false;
  }

  function renderActivity() {
    activityList.replaceChildren();
    activeActivity.forEach((item) => activityList.append(createActivityRow(item, false)));
  }

  function activityDescription(item) {
    const oldAssignee = members.find((member) => member.uid === item.previousValue?.assigneeUid)?.displayName || "Sem responsável";
    const newAssignee = members.find((member) => member.uid === item.newValue?.assigneeUid)?.displayName || "Sem responsável";
    const messages = {
      created: `criou “${item.taskTitle}”`,
      status_changed: `alterou o status de “${item.taskTitle}”: ${STATUS_LABELS[item.previousValue] || item.previousValue} → ${STATUS_LABELS[item.newValue] || item.newValue}`,
      assigned: `alterou o responsável de “${item.taskTitle}”: ${oldAssignee} → ${newAssignee}`,
      priority_changed: `alterou a prioridade de “${item.taskTitle}”: ${PRIORITY_LABELS[item.previousValue?.priority] || item.previousValue?.priority} → ${PRIORITY_LABELS[item.newValue?.priority] || item.newValue?.priority}`,
      edited: `editou “${item.taskTitle}”`,
      comment: `comentou em “${item.taskTitle}”`,
      invited: `enviou convite para ${item.newValue?.email || "um novo membro"}`,
      role_changed: `alterou a permissão de um membro: ${item.previousValue} → ${item.newValue}`,
      deleted: `excluiu “${item.taskTitle}”`
    };
    return `${item.actorName || "Usuário"} ${messages[item.type] || "atualizou o quadro"}.`;
  }

  function createActivityRow(item, linkTask) {
    const row = createElement("article", "activity-item");
    row.append(createAvatar(item.actorName, item.actorPhotoURL, "avatar-small"));
    const text = createElement("div", "activity-copy");
    const message = createElement("p", "activity-message", activityDescription(item));
    if (linkTask && item.taskId) {
      const link = createElement("a", "activity-task-link", "Abrir tarefa");
      link.href = taskHref(item.taskId);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      text.append(message, link);
    } else {
      text.append(message);
    }
    text.append(createElement("time", "activity-date", formatDate(item.createdAt)));
    row.append(text);
    return row;
  }

  function renderBoardActivity() {
    const list = document.querySelector("#board-activity");
    list.replaceChildren();
    if (!boardActivity.length) list.append(createElement("p", "empty-state", "Nenhuma atividade registrada ainda."));
    boardActivity.forEach((item) => list.append(createActivityRow(item, true)));
  }

  function renderCurrentRoute() {
    if (!currentUser) return;
    const route = getRoute();
    const task = route.taskId ? tasks.find((item) => item.id === route.taskId) : null;
    appView.hidden = Boolean(route.taskId);
    taskDetailView.hidden = !route.taskId;
    if (!route.taskId) {
      if (unsubscribeComments) { unsubscribeComments(); unsubscribeComments = null; }
      if (unsubscribeActivity) { unsubscribeActivity(); unsubscribeActivity = null; }
      activeDetailTaskId = null;
      document.title = "Meu quadro | Estúdio Norte";
      return;
    }
    document.title = task ? `${task.title} | Meu quadro` : "Tarefa | Meu quadro";
    if (!task) {
      taskDetailView.replaceChildren(createElement("p", "empty-state", "Tarefa não encontrada ou sem acesso."));
      return;
    }
    if (activeDetailTaskId !== task.id) watchTaskDetails(task.id);
    renderTaskDetails(task);
  }

  function watchTaskDetails(taskId) {
    if (activeDetailTaskId === taskId) return;
    unsubscribeComments?.();
    unsubscribeActivity?.();
    activeDetailTaskId = taskId;
    unsubscribeComments = onSnapshot(query(taskCommentsRef(taskId), orderBy("createdAt", "asc")), (snapshot) => {
      activeComments = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
      const task = tasks.find((item) => item.id === taskId);
      if (task) renderTaskDetails(task);
    }, () => showToast("Não foi possível carregar os comentários."));
    unsubscribeActivity = onSnapshot(query(taskActivityRef(taskId), orderBy("createdAt", "desc")), (snapshot) => {
      activeActivity = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
      const task = tasks.find((item) => item.id === taskId);
      if (task) renderTaskDetails(task);
    }, () => showToast("Não foi possível carregar o histórico."));
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
      await signInWithEmailAndPassword(auth, usernameInput.value.trim().toLowerCase(), passwordInput.value);
      loginForm.reset();
    } catch (error) {
      setAuthFeedback(authErrorMessage(error, "login"));
    } finally {
      loginButton.disabled = false;
      loginButton.querySelector("span").textContent = "Entrar";
    }
  });

  showRegisterButton.addEventListener("click", showRegisterForm);
  showLoginButton.addEventListener("click", showLoginForm);

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
      const credential = await createUserWithEmailAndPassword(auth, registerUsernameInput.value.trim().toLowerCase(), registerPasswordInput.value);
      const displayName = registerDisplayNameInput.value.trim();
      if (displayName) {
        await updateProfile(credential.user, { displayName });
        await ensureBoardMembership(credential.user);
      }
      registerForm.reset();
    } catch (error) {
      registerFeedback.textContent = authErrorMessage(error, "register");
    } finally {
      registerButton.disabled = false;
      registerButton.querySelector("span").textContent = "Criar conta";
    }
  });

  document.querySelector("#open-members-dialog").addEventListener("click", () => {
    if (isAdmin()) document.querySelector("#members-dialog").showModal();
  });
  document.querySelector("#close-members-dialog").addEventListener("click", () => document.querySelector("#members-dialog").close());
  inviteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!isAdmin() || !currentUser || !inviteForm.reportValidity()) return;
    const email = inviteEmailInput.value.trim().toLowerCase();
    const role = inviteRoleInput.value;
    if (!["owner", "editor", "reader"].includes(role)) return;
    if (email === currentUser.email?.toLowerCase()) {
      inviteFeedback.textContent = "Você já é membro deste quadro.";
      return;
    }

    inviteButton.disabled = true;
    inviteButton.textContent = "Enviando convite...";
    inviteFeedback.textContent = "";
    try {
      await setDoc(invitationRef(email), {
        email,
        role,
        invitedBy: currentUser.uid,
        inviterName: currentUser.displayName || currentUser.email || "Proprietário",
        createdAt: serverTimestamp(),
        acceptedBy: null,
        acceptedAt: null
      });
      localStorage.setItem("kanban-email-link", email);
      const continueUrl = new URL("/invite", window.location.origin);
      continueUrl.searchParams.set("board", BOARD_ID);
      await sendSignInLinkToEmail(auth, email, { url: continueUrl.toString(), handleCodeInApp: true });
      inviteFeedback.textContent = `Convite enviado para ${email}. O acesso será de ${role === "owner" ? "proprietário" : role === "editor" ? "editor" : "leitor"}.`;
      inviteFeedback.classList.add("is-success");
      inviteForm.reset();
      await writeActivity({ id: null, title: "Quadro colaborativo" }, "invited", null, { email, role });
    } catch (error) {
      inviteFeedback.classList.remove("is-success");
      inviteFeedback.textContent = error.code === "auth/unauthorized-continue-uri"
        ? "Autorize este domínio no Firebase Authentication antes de enviar convites."
        : error.code === "auth/operation-not-allowed"
          ? "Ative E-mail link no Firebase Authentication."
          : error.code === "permission-denied"
            ? "Somente o proprietário pode enviar convites. Confira as regras publicadas."
            : "Não foi possível enviar o convite. Confira E-mail link e os domínios autorizados no Firebase.";
    } finally {
      inviteButton.disabled = false;
      inviteButton.textContent = "Enviar convite";
    }
  });

  document.querySelector("#notification-button").addEventListener("click", () => {
    const panel = document.querySelector("#notification-panel");
    panel.hidden = !panel.hidden;
  });
  memberList.addEventListener("change", async (event) => {
    if (!isAdmin() || !event.target.matches(".member-role-select")) return;
    const uid = event.target.dataset.memberUid;
    const previousRole = members.find((member) => member.uid === uid)?.role;
    const newRole = event.target.value;
    if (!uid || !["owner", "reader", "editor"].includes(newRole)) return;
    try {
      await updateDoc(memberRef(uid), { role: newRole });
      const eventData = {
        boardId: BOARD_ID,
        taskId: null,
        taskTitle: "Quadro colaborativo",
        actorUid: currentUser.uid,
        actorName: currentUser.displayName || currentUser.email || "Administrador",
        actorPhotoURL: currentUser.photoURL || "",
        type: "role_changed",
        previousValue: previousRole,
        newValue: newRole,
        targetUid: uid,
        createdAt: serverTimestamp()
      };
      await Promise.all([
        addDoc(collection(db, "boards", BOARD_ID, "activity"), eventData),
        sendNotifications([uid], "role_changed", { id: null, title: "Quadro colaborativo" }, `Seu acesso foi alterado para ${{ owner: "Proprietário", editor: "Editor", reader: "Leitor" }[newRole]}.`)
      ]);
      showToast("Permissão atualizada.");
    } catch {
      showToast("Não foi possível alterar a permissão.");
    }
  });

  commentInput.addEventListener("input", renderMentionSuggestions);
  commentInput.addEventListener("click", renderMentionSuggestions);
  commentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!canEdit() || !currentUser || !activeDetailTaskId) return;
    const content = commentInput.value.trim();
    if (!content) return;
    const task = tasks.find((item) => item.id === activeDetailTaskId);
    if (!task) return;
    const mentionedHandles = [...content.matchAll(/@([a-z0-9._-]+)/gi)].map((match) => match[1].toLowerCase());
    const mentionedMembers = members.filter((member) => mentionedHandles.includes(member.handle));
    try {
      await addDoc(taskCommentsRef(task.id), {
        taskId: task.id,
        authorUid: currentUser.uid,
        authorName: currentUser.displayName || currentUser.email || "Usuário",
        authorPhotoURL: currentUser.photoURL || "",
        content,
        mentions: mentionedMembers.map((member) => member.uid),
        createdAt: serverTimestamp()
      });
      await writeActivity(task, "comment", null, content);
      const mentionedUids = new Set(mentionedMembers.map((member) => member.uid));
      await sendNotifications(members.filter((member) => !mentionedUids.has(member.uid)).map((member) => member.uid), "comment", task, `${currentUser.displayName || currentUser.email} comentou em “${task.title}”.`);
      if (mentionedMembers.length) await sendNotifications(mentionedMembers.map((member) => member.uid), "mention", task, `${currentUser.displayName || currentUser.email} mencionou você em “${task.title}”.`);
      commentForm.reset();
      mentionSuggestions.hidden = true;
    } catch {
      showToast("Não foi possível publicar o comentário. Confira as permissões do quadro.");
    }
  });

  window.addEventListener("popstate", renderCurrentRoute);

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

  document.querySelector("#open-task-dialog").addEventListener("click", () => openTaskEditor());
  document.querySelector("#close-task-dialog").addEventListener("click", () => dialog.close());
  document.querySelector("#cancel-task").addEventListener("click", () => dialog.close());
  taskForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!canEdit() || !currentUser) return;
    const title = taskTitleInput.value.trim();
    if (!title) { taskTitleInput.focus(); return; }
    const description = taskDescriptionInput.value.trim();
    const priority = taskPriorityInput.value;
    const assigneeUid = taskAssigneeInput.value || null;
    const dueDate = taskDueDateInput.value || null;
    try {
      if (editingTaskId) {
        const existing = tasks.find((task) => task.id === editingTaskId);
        if (!existing) throw new Error("Tarefa não encontrada.");
        const changes = { title, description, priority, assigneeUid, dueDate };
        const assignedMember = members.find((member) => member.uid === assigneeUid);
        const assignmentChanged = existing.assigneeUid !== assigneeUid;
        const priorityChanged = priority !== existing.priority;
        const activityType = assignmentChanged ? "assigned" : priorityChanged ? "priority_changed" : "edited";
        const notice = assignmentChanged && assignedMember
          ? `${assignedMember.displayName} foi atribuído(a) a “${title}”.`
          : priorityChanged ? `A prioridade de “${title}” foi alterada.` : null;
        await updateTask(existing, changes, activityType, {
          title: existing.title,
          description: existing.description,
          priority: existing.priority,
          assigneeUid: existing.assigneeUid,
          dueDate: existing.dueDate || null
        }, changes, notice);
        showToast("Tarefa atualizada.");
      } else {
        const reference = doc(tasksRef());
        const newTask = {
          id: reference.id,
          title,
          description,
          status: "todo",
          priority,
          assigneeUid,
          dueDate,
          createdBy: currentUser.uid,
          updatedBy: currentUser.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };
        await setDoc(reference, newTask);
        await writeActivity(newTask, "created", null, {
          title: newTask.title,
          description: newTask.description,
          status: newTask.status,
          priority: newTask.priority,
          assigneeUid: newTask.assigneeUid,
          dueDate: newTask.dueDate
        });
        const assignedMember = members.find((member) => member.uid === assigneeUid);
        if (assignedMember) await sendNotifications([assigneeUid], "assigned", newTask, `Você foi atribuído(a) a “${title}”.`);
        showToast("Tarefa adicionada ao quadro.");
      }
      taskForm.reset();
      editingTaskId = null;
      dialog.close();
    } catch (error) {
      showToast(authErrorMessage(error, "task"));
    }
  });

  board.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button || !canEdit()) return;
    const card = button.closest("[data-task-id]");
    const task = tasks.find((item) => item.id === card.dataset.taskId);
    if (!task) return;
    if (button.dataset.action === "edit") { openTaskEditor(task); return; }
    if (button.dataset.action === "delete" && window.confirm(`Excluir “${task.title}”?`)) {
      try {
        await writeActivity(task, "deleted", {
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          assigneeUid: task.assigneeUid,
          dueDate: task.dueDate
        }, null);
        await deleteDoc(taskRef(task.id));
        await sendNotifications(members.map((member) => member.uid), "deleted", task, `A tarefa “${task.title}” foi excluída.`);
        showToast("Tarefa excluída.");
      } catch {
        showToast("Não foi possível excluir a tarefa. Confira as permissões do quadro.");
      }
    }
  });
  board.addEventListener("change", (event) => {
    if (event.target.matches(".task-status")) void moveTask(event.target.closest("[data-task-id]").dataset.taskId, event.target.value);
  });
  board.addEventListener("keydown", (event) => {
    if (!canEdit() || !event.target.matches(".task-card") || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
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
    showRegisterButton.disabled = false;
    showLoginButton.disabled = false;
  } else {
    async function initializeAuth() {
      try {
        await completeEmailLinkSignIn();
      } catch (error) {
        showLogin(authErrorMessage(error, "login"));
      }
      onAuthStateChanged(auth, (user) => {
        if (user) void enterApp(user);
        else showLogin();
      });
    }
    void initializeAuth();
  }
})();
