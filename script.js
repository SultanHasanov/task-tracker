const API_URL = "https://6680fc4cf4b14d99.mokky.dev/items";
const TELEGRAM_BOT_TOKEN = "8190479365:AAHnjDWn6sr_8SF6Cj_jw7HR2-Cu1fM_syA";
const TELEGRAM_CHAT_ID = "-4873892757";

$(document).ready(function () {
  // Инициализация
  initModals();
  initDragAndDrop();
  loadTasks();

  // Инициализация фильтров
  $(".filter-assignee").change(function () {
    const status = $(this).closest(".column").attr("id");
    const assignee = $(this).val();
    filterTasks(status, assignee);
  });

  function filterTasks(status, assignee) {
    $(`#${status}-tasks .task-card`).each(function () {
      const taskAssignee = $(this)
        .find(".task-meta span:first")
        .text()
        .replace("Ответственный: ", "")
        .trim();
      if (!assignee || taskAssignee === assignee) {
        $(this).show();
      } else {
        $(this).hide();
      }
    });
  }

  // Открытие модального окна для новой задачи
  $("#add-task-btn").click(function () {
    $("#modal-title").text("Новая задача");
    $("#task-id").val("");
    $("#task-form")[0].reset();
    $("#revision-comment-group").hide();
    $("#task-modal").show();
  });

  // Отправка формы задачи
  $("#task-form").submit(async function (e) {
    e.preventDefault();

    // Проверяем, нужно ли требовать комментарий на доработку
    if (
      $("#revision-comment-group").is(":visible") &&
      !$("#revision-comment").val()
    ) {
      alert("Пожалуйста, укажите комментарий для доработки");
      return;
    }

    const taskData = {
      title: $("#task-title").val(),
      description: $("#task-description").val(),
      assignee: $("#task-assignee").val(),
      dueDate: $("#task-due-date").val(),
      priority: $("#task-priority").val(),
      status: $("#task-id").val()
        ? $(`#task-card-${$("#task-id").val()}`)
            .closest(".column")
            .attr("id")
        : "todo",
      revisionComment: $("#revision-comment").val() || null,
      isRevision: $("#revision-comment").val() ? true : false,
    };

    // Остальной код без изменений
    if ($("#task-id").val()) {
      await updateTask($("#task-id").val(), taskData);
    } else {
      await createTask(taskData);
    }

    $("#task-modal").hide();
    loadTasks();
  });

  // Отправка формы доработки
  $("#revision-form").submit(async function (e) {
    e.preventDefault();

    const taskId = $("#revision-task-id").val();
    const comment = $("#revision-comment-text").val();

    // Получаем текущую задачу
    const response = await fetch(`${API_URL}/${taskId}`);
    const task = await response.json();

    // Обновляем задачу
    await updateTask(taskId, {
      ...task,
      status: "todo",
      revisionComment: comment,
      isRevision: true,
    });

    // Отправляем уведомление в Telegram
    sendTelegramNotification(
      `Задача "${task.title}" отправлена на доработку. Комментарий: ${comment}`,
      task
    );

    $("#revision-modal").hide();
    $("#revision-form")[0].reset();
    loadTasks();
  });

  // Подтверждение удаления
  $("#confirm-delete-btn").click(async function () {
    const taskId = $("#delete-modal").data("task-id");
    await deleteTask(taskId);
    $("#delete-modal").hide();
    loadTasks();
  });
});

function initModals() {
  // Закрытие модальных окон
  $(
    ".close, .cancel-btn, #cancel-btn, #cancel-revision-btn, #cancel-delete-btn"
  ).click(function () {
    $(this).closest(".modal").hide();
  });

  // Закрытие при клике вне окна
  $(window).click(function (event) {
    if ($(event.target).hasClass("modal")) {
      $(".modal").hide();
    }
  });
}

function initDragAndDrop() {
  $(".task-list")
    .sortable({
      connectWith: ".task-list",
      placeholder: "task-placeholder",
      receive: async function (event, ui) {
        const taskId = ui.item.data("task-id");
        const newStatus = $(this).parent().attr("id");

        // Получаем текущую задачу
        const response = await fetch(`${API_URL}/${taskId}`);
        const task = await response.json();

        // Обновляем статус задачи
        await updateTask(taskId, {
          ...task,
          status: newStatus,
          isRevision:
            newStatus === "todo" && task.status === "done"
              ? false
              : task.isRevision,
        });

        // Отправляем уведомление в Telegram
        const statusText = getStatusText(newStatus);
        sendTelegramNotification(
          `Задача "${task.title}" перемещена в статус "${statusText}"`,
          task
        );

        // Перезагружаем задачи
        loadTasks();
      },
    })
    .disableSelection();
}

async function loadTasks() {
    try {
        const response = await fetch(API_URL);
        const tasks = await response.json();
        
        // Очищаем колонки
        $('.task-list').empty();
        
        // Сбрасываем фильтры
        $('.filter-assignee').val('');
        
        // Добавляем задачи в соответствующие колонки
        tasks.forEach(task => {
            renderTask(task);
        });
    } catch (error) {
        console.error('Ошибка при загрузке задач:', error);
    }
}

function renderTask(task) {
  const taskElement = $(`
        <div class="task-card ${task.status === 'in-progress' ? 'in-progress' : ''} ${task.status === 'done' ? 'done' : ''} ${task.isRevision ? 'revision' : ''}" 
             id="task-card-${task.id}" data-task-id="${task.id}" data-status="${task.status}">
            <div class="task-actions">
                <button class="edit-task" title="Редактировать"><i class="fas fa-edit"></i></button>
                <button class="delete-task" title="Удалить"><i class="fas fa-trash"></i></button>
            </div>
            <h3>${task.title} ${task.isRevision && task.status === 'todo' ? '<span class="revision-badge" title="На доработке"><i class="fas fa-redo"></i></span>' : ''}</h3>
            <div class="task-description">${task.description || 'Нет описания'}</div>
            <div class="task-meta">
                <span><i class="fas fa-user"></i> Ответственный: ${task.assignee || 'Не указан'}</span>
                <span><i class="fas fa-calendar-alt"></i> ${formatDate(task.dueDate)}</span>
            </div>
            <div class="task-status-select">
                <select class="status-select">
                    <option value="todo" ${task.status === 'todo' ? 'selected' : ''}>Задачи</option>
                    <option value="in-progress" ${task.status === 'in-progress' ? 'selected' : ''}>В работе</option>
                    <option value="done" ${task.status === 'done' ? 'selected' : ''}>Сделано</option>
                </select>
            </div>
            <div class="task-meta">
                <span class="task-priority priority-${task.priority}">
                    ${getPriorityText(task.priority)}
                </span>
                ${task.revisionComment ? '<span class="revision-info" title="Комментарий на доработку"><i class="fas fa-comment-dots"></i></span>' : ''}
            </div>
        </div>
    `);

  // Обработчик клика для раскрытия/скрытия описания
  taskElement.click(function (e) {
    // Игнорируем клики по кнопкам действий
    if ($(e.target).closest(".task-actions").length === 0) {
      $(this).toggleClass("expanded");
    }
  });

  // Обработчик редактирования
  taskElement.find(".edit-task").click(async function (e) {
    e.stopPropagation();

    const response = await fetch(`${API_URL}/${task.id}`);
    const taskData = await response.json();

    $("#modal-title").text("Редактировать задачу");
    $("#task-id").val(task.id);
    $("#task-title").val(taskData.title);
    $("#task-description").val(taskData.description);
    $("#task-assignee").val(taskData.assignee);
    $("#task-due-date").val(taskData.dueDate);
    $("#task-priority").val(taskData.priority);

    if (taskData.status === "todo" && taskData.isRevision) {
      $("#revision-comment").val(taskData.revisionComment);
      $("#revision-comment-group").show();
    } else {
      $("#revision-comment-group").hide();
    }

    $("#task-modal").show();
  });


   // Добавьте обработчик изменения статуса
    taskElement.find('.status-select').change(async function() {
        const newStatus = $(this).val();
        const taskId = taskElement.data('task-id');
        
        // Получаем текущую задачу
        const response = await fetch(`${API_URL}/${taskId}`);
        const taskData = await response.json();
        
        // Обновляем статус задачи
        await updateTask(taskId, {
            ...taskData,
            status: newStatus,
            isRevision: newStatus === 'todo' && taskData.status === 'done' ? false : taskData.isRevision
        });

        // Отправляем уведомление в Telegram
        const statusText = getStatusText(newStatus);
        sendTelegramNotification(`Статус задачи "${taskData.title}" изменен на "${statusText}"`, taskData);
        
        // Перезагружаем задачи
        loadTasks();
    });
  // Обработчик удаления
  taskElement.find(".delete-task").click(function (e) {
    e.stopPropagation();
    $("#delete-modal").data("task-id", task.id).show();
  });

  // Если задача в статусе "Сделано", добавляем кнопку "На доработку"
  if (task.status === "done") {
    const revisionButton = $(
      `<button class="revision-btn"><i class="fas fa-undo"></i> На доработку</button>`
    );
    revisionButton.click(function (e) {
      e.stopPropagation();
      $("#revision-task-id").val(task.id);
      $("#revision-modal").show();
    });
    taskElement.append(revisionButton);
  }

  $(`#${task.status}-tasks`).append(taskElement);
}

async function createTask(taskData) {
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(taskData),
    });

    const newTask = await response.json();

    // Отправляем уведомление в Telegram
    sendTelegramNotification(
      `Создана новая задача: "${taskData.title}". Статус: "Задачи"`,
      taskData
    );

    return newTask;
  } catch (error) {
    console.error("Ошибка при создании задачи:", error);
  }
}

async function updateTask(taskId, taskData) {
  try {
    const response = await fetch(`${API_URL}/${taskId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(taskData),
    });

    return await response.json();
  } catch (error) {
    console.error("Ошибка при обновлении задачи:", error);
  }
}

async function deleteTask(taskId) {
  try {
    await fetch(`${API_URL}/${taskId}`, {
      method: "DELETE",
    });

    // Отправляем уведомление в Telegram
    const taskTitle = $(`#task-card-${taskId} h3`).text().trim();
    const assignee = $(`#task-card-${taskId} .task-meta span:first`)
      .text()
      .replace("Ответственный: ", "");
    sendTelegramNotification(`Задача "${taskTitle}" была удалена`, {
      assignee,
    });
  } catch (error) {
    console.error("Ошибка при удалении задачи:", error);
  }
}

function sendTelegramNotification(message, taskData) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

  // Добавляем информацию об ответственном в сообщение
  const assigneeInfo = taskData.assignee
    ? `\nОтветственный: ${taskData.assignee}`
    : "";
  const fullMessage = `${message}${assigneeInfo}`;

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: fullMessage,
    }),
  }).catch((error) => {
    console.error("Ошибка при отправке уведомления в Telegram:", error);
  });
}

function formatDate(dateString) {
  if (!dateString) return "Нет срока";

  const options = { day: "numeric", month: "short", year: "numeric" };
  const date = new Date(dateString);
  return date.toLocaleDateString("ru-RU", options);
}

function getPriorityText(priority) {
  const priorities = {
    low: "Низкий",
    medium: "Средний",
    high: "Высокий",
  };
  return priorities[priority] || priority;
}

function getStatusText(status) {
  const statuses = {
    todo: "Задачи",
    "in-progress": "В работе",
    done: "Сделано",
  };
  return statuses[status] || status;
}
