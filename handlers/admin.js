const { Markup } = require('telegraf');
const { getWeekDaysForCalendar } = require('../utils/dates');
const BlockedDate = require('../models/BlockedDate');
const Order = require('../models/Order');
const adminStates = require('./adminSessions');

module.exports = bot => {
  const adminId = Number(process.env.MY_CHAT_ID);

  function isWaitingNote() {
    return !!adminStates[adminId]?.expectingNoteFor;
  }

  function showAdminMenu(ctx) {
    ctx.reply(
      'Панель адміністратора:',
      Markup.keyboard([
        ['Нові', 'Підтверджені', 'В процесі'],
        ['Виконані', 'Скасовані'],
        ['⚙️ Коригування дат'],
      ]).resize(),
    );
  }

  function formatOrderText(order, statusLabel) {
    const serviceNames = {
      website: 'Website',
      landing: 'Landing Page',
      bot: 'Telegram Bot',
      unknown: 'Не визначено',
    };
    const timeLabels = {
      before_12: 'до 12pm',
      noon_to_16: '12pm - 4pm',
      after_16: 'після 4pm',
    };
    const paymentStatus = order.isPaid ? ' (Оплачено)' : '';
    const formattedTime = timeLabels[order.time] || order.time;

    let orderText =
      `Заявка [${statusLabel}]${paymentStatus}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `Послуга: ${serviceNames[order.service] || order.service}\n` +
      `Дизайн: ${order.hasDesign ? 'Є' : 'Немає'}\n` +
      `Бізнес: ${order.business || 'Не вказано'}\n` +
      `Дата: ${order.date}\n` +
      `Час: ${formattedTime}\n` +
      `Контакт: ${order.contact}`;

    if (order.note && order.note.trim() !== '') {
      orderText += `\n━━━━━━━━━━━━━━━━━━━━\nНотатка: ${order.note}`;
    }

    return orderText;
  }

  function buildActionButtons(order, folderType, orderPosition, ordersLength) {
    const actionButtons = [];

    if (folderType === 'new') {
      actionButtons.push([
        Markup.button.callback('Підтвердити', `adm_confirm_${order._id}`),
        Markup.button.callback('В процес', `adm_process_${order._id}`),
        Markup.button.callback('Скасувати', `adm_cancel_${order._id}`),
      ]);
    } else if (folderType === 'confirmed') {
      actionButtons.push([
        Markup.button.callback('В процес', `adm_process_${order._id}`),
        Markup.button.callback('Виконано', `adm_done_${order._id}`),
      ]);
    } else if (folderType === 'process') {
      actionButtons.push([
        Markup.button.callback('Виконано', `adm_done_${order._id}`),
        Markup.button.callback('Скасувати', `adm_cancel_${order._id}`),
      ]);
    } else if (folderType === 'done') {
      actionButtons.push([
        Markup.button.callback(
          'Повернути в процес',
          `adm_process_${order._id}`,
        ),
      ]);
    } else if (folderType === 'cancelled') {
      actionButtons.push([
        Markup.button.callback('Повернути в нові', `adm_new_${order._id}`),
        Markup.button.callback('Видалити', `adm_delete_${order._id}`),
      ]);
    }

    actionButtons.push([
      Markup.button.callback('📝 Нотатка', `adm_note_${order._id}`),
    ]);

    const navButtons = [];
    if (orderPosition > 0) {
      navButtons.push(Markup.button.callback('◀️ Назад', 'adm_page_prev'));
    } else {
      navButtons.push(Markup.button.callback('⏸ Перша', 'adm_page_noop'));
    }
    if (orderPosition < ordersLength - 1) {
      navButtons.push(Markup.button.callback('Далі ▶️', 'adm_page_next'));
    } else {
      navButtons.push(Markup.button.callback('⏸ Остання', 'adm_page_noop'));
    }
    actionButtons.push(navButtons);

    return actionButtons;
  }

  function getQueryByFolder(folderType) {
    const queries = {
      new: { status: { $in: ['new', null, undefined] } },
      confirmed: { status: 'confirmed' },
      process: { status: 'in_process' },
      done: { status: 'done' },
      cancelled: { status: 'cancelled' },
    };
    return queries[folderType] || {};
  }

  async function renderAdminOrderPage(
    ctx,
    folderType,
    index = 0,
    isEdit = false,
  ) {
    const query = getQueryByFolder(folderType);
    const folderNames = {
      new: 'Нові',
      confirmed: 'Підтверджені',
      process: 'В процесі',
      done: 'Виконані',
      cancelled: 'Скасовані',
    };
    const labelMap = {
      new: 'Нова',
      confirmed: 'Підтверджена',
      process: 'В процесі',
      done: 'Виконана',
      cancelled: 'Скасована',
    };

    try {
      const orders = await Order.find(query).sort({ createdAt: -1 });

      if (orders.length === 0) {
        const emptyMsg = `Папка "${folderNames[folderType]}" порожня.`;
        if (isEdit) return ctx.editMessageText(emptyMsg).catch(() => {});
        return ctx.reply(emptyMsg);
      }

      let localIndex = Number(index);
      if (localIndex < 0) localIndex = 0;
      if (localIndex >= orders.length) localIndex = orders.length - 1;

      const order = orders[localIndex];
      const text = `${formatOrderText(order, labelMap[folderType])}\n\nЗаявка: ${localIndex + 1} з ${orders.length}`;
      const actionButtons = buildActionButtons(
        order,
        folderType,
        localIndex,
        orders.length,
      );
      const inlineKeyboard = Markup.inlineKeyboard(actionButtons);

      let sentMessage;
      if (isEdit) {
        sentMessage = await ctx
          .editMessageText(text, inlineKeyboard)
          .catch(() => {});
      } else {
        sentMessage = await ctx.reply(text, inlineKeyboard);
      }

      adminStates[adminId] = {
        folderType,
        currentIndex: localIndex,
        mainMessageId: isEdit
          ? ctx.callbackQuery?.message?.message_id || ctx.message?.message_id
          : sentMessage?.message_id,
      };
    } catch (err) {
      console.error(err);
      ctx.reply('Помилка при завантаженні заявки.');
    }
  }

  // ============================================
  // МЕНЮ
  // ============================================

  bot.hears(['Всі заявки', '📋 Всі заявки', 'Назад до папок'], ctx => {
    if (ctx.from.id !== adminId) return;
    if (isWaitingNote()) return;
    showAdminMenu(ctx);
  });

  bot.hears('Нові', ctx => {
    if (ctx.from.id !== adminId) return;
    if (isWaitingNote()) return;
    renderAdminOrderPage(ctx, 'new', 0, false);
  });

  bot.hears('Підтверджені', ctx => {
    if (ctx.from.id !== adminId) return;
    if (isWaitingNote()) return;
    renderAdminOrderPage(ctx, 'confirmed', 0, false);
  });

  bot.hears('В процесі', ctx => {
    if (ctx.from.id !== adminId) return;
    if (isWaitingNote()) return;
    renderAdminOrderPage(ctx, 'process', 0, false);
  });

  bot.hears('Виконані', ctx => {
    if (ctx.from.id !== adminId) return;
    if (isWaitingNote()) return;
    renderAdminOrderPage(ctx, 'done', 0, false);
  });

  bot.hears('Скасовані', ctx => {
    if (ctx.from.id !== adminId) return;
    if (isWaitingNote()) return;
    renderAdminOrderPage(ctx, 'cancelled', 0, false);
  });

  bot.hears('⚙️ Коригування дат', async ctx => {
    if (ctx.from.id !== adminId) return;
    if (isWaitingNote()) return;
    const keyboard = await showAdminDatePicker(ctx, new Date());
    ctx.reply(
      '🔧 Натисни на день, щоб закрити (🔒) або відкрити (✅) для клієнтів:',
      keyboard,
    );
  });

  // ============================================
  // НАВІГАЦІЯ
  // ============================================

  bot.action('adm_page_next', async ctx => {
    if (ctx.from.id !== adminId) return ctx.answerCbQuery();
    const state = adminStates[adminId];
    if (!state) return ctx.answerCbQuery();
    ctx.answerCbQuery();
    await renderAdminOrderPage(
      ctx,
      state.folderType,
      state.currentIndex + 1,
      true,
    );
  });

  bot.action('adm_page_prev', async ctx => {
    if (ctx.from.id !== adminId) return ctx.answerCbQuery();
    const state = adminStates[adminId];
    if (!state) return ctx.answerCbQuery();
    ctx.answerCbQuery();
    await renderAdminOrderPage(
      ctx,
      state.folderType,
      state.currentIndex - 1,
      true,
    );
  });

  bot.action('adm_page_noop', ctx => ctx.answerCbQuery());

  // ============================================
  // НОТАТКА
  // ============================================

  bot.action(/^adm_note_(.+)$/, async ctx => {
    if (ctx.from.id !== adminId) return ctx.answerCbQuery();
    const orderId = ctx.match[1];
    ctx.answerCbQuery();

    adminStates[adminId] = {
      ...adminStates[adminId],
      expectingNoteFor: orderId,
      mainMessageId:
        ctx.callbackQuery?.message?.message_id ||
        adminStates[adminId]?.mainMessageId,
    };

    const prompt = await ctx.reply(
      '✍️ Введіть текст нотатки (або "-", щоб очистити):',
    );
    adminStates[adminId].promptMessageId = prompt.message_id;
  });

  // ============================================
  // ОБРОБКА ТЕКСТУ — нотатка першою!
  // ============================================

  bot.on('text', async (ctx, next) => {
    if (ctx.from.id !== adminId) return next();
    const state = adminStates[adminId];
    if (!state?.expectingNoteFor) return next();

    try {
      let noteText = ctx.message.text.trim();
      if (noteText === '-') noteText = '';

      // Оновлюємо в БД
      await Order.findByIdAndUpdate(state.expectingNoteFor, { note: noteText });
      // Отримуємо оновлений документ
      const updatedOrder = await Order.findById(state.expectingNoteFor).lean();

      if (state.promptMessageId) {
        await ctx.deleteMessage(state.promptMessageId).catch(() => {});
      }
      await ctx.deleteMessage(ctx.message.message_id).catch(() => {});

      const folderType = state.folderType;
      const orders = await Order.find(getQueryByFolder(folderType)).sort({
        createdAt: -1,
      });
      const orderPosition = Math.min(
        Math.max(0, state.currentIndex || 0),
        orders.length - 1,
      );

      const labelMap = {
        new: 'Нова',
        confirmed: 'Підтверджена',
        process: 'В процесі',
        done: 'Виконана',
        cancelled: 'Скасована',
      };

      const newText = `${formatOrderText(updatedOrder, labelMap[folderType])}\n\nЗаявка: ${orderPosition + 1} з ${orders.length}`;
      const actionButtons = buildActionButtons(
        updatedOrder,
        folderType,
        orderPosition,
        orders.length,
      );

      if (state.mainMessageId) {
        await ctx.telegram
          .editMessageText(
            adminId,
            state.mainMessageId,
            null,
            newText,
            Markup.inlineKeyboard(actionButtons),
          )
          .catch(err => console.error('edit error:', err));
      }

      adminStates[adminId] = {
        ...state,
        expectingNoteFor: null,
        promptMessageId: null,
      };
    } catch (err) {
      console.error(err);
      ctx.reply('Помилка при оновленні нотатки.');
    }
  });

  // ============================================
  // ДІЇ З ЗАЯВКАМИ
  // ============================================

  bot.action(/^adm_confirm_(.+)$/, async ctx => {
    if (ctx.from.id !== adminId) return ctx.answerCbQuery();
    try {
      await Order.findByIdAndUpdate(ctx.match[1], { status: 'confirmed' });
      ctx.answerCbQuery('Заявку підтверджено');
      const state = adminStates[adminId] || {
        folderType: 'new',
        currentIndex: 0,
      };
      await renderAdminOrderPage(
        ctx,
        state.folderType,
        state.currentIndex,
        true,
      );
    } catch (err) {
      ctx.answerCbQuery('Помилка');
    }
  });

  bot.action(/^adm_process_(.+)$/, async ctx => {
    if (ctx.from.id !== adminId) return ctx.answerCbQuery();
    try {
      await Order.findByIdAndUpdate(ctx.match[1], { status: 'in_process' });
      ctx.answerCbQuery('Заявку переведено в процес');
      const state = adminStates[adminId] || {
        folderType: 'new',
        currentIndex: 0,
      };
      await renderAdminOrderPage(
        ctx,
        state.folderType,
        state.currentIndex,
        true,
      );
    } catch (err) {
      ctx.answerCbQuery('Помилка');
    }
  });

  bot.action(/^adm_done_(.+)$/, async ctx => {
    if (ctx.from.id !== adminId) return ctx.answerCbQuery();
    try {
      await Order.findByIdAndUpdate(ctx.match[1], { status: 'done' });
      ctx.answerCbQuery('Заявку виконано');
      const state = adminStates[adminId] || {
        folderType: 'new',
        currentIndex: 0,
      };
      await renderAdminOrderPage(
        ctx,
        state.folderType,
        state.currentIndex,
        true,
      );
    } catch (err) {
      ctx.answerCbQuery('Помилка');
    }
  });

  bot.action(/^adm_cancel_(.+)$/, async ctx => {
    if (ctx.from.id !== adminId) return ctx.answerCbQuery();
    try {
      await Order.findByIdAndUpdate(ctx.match[1], { status: 'cancelled' });
      ctx.answerCbQuery('Заявку скасовано');
      const state = adminStates[adminId] || {
        folderType: 'new',
        currentIndex: 0,
      };
      await renderAdminOrderPage(
        ctx,
        state.folderType,
        state.currentIndex,
        true,
      );
    } catch (err) {
      ctx.answerCbQuery('Помилка');
    }
  });

  bot.action(/^adm_new_(.+)$/, async ctx => {
    if (ctx.from.id !== adminId) return ctx.answerCbQuery();
    try {
      await Order.findByIdAndUpdate(ctx.match[1], { status: 'new' });
      ctx.answerCbQuery('Повернуто в нові');
      const state = adminStates[adminId] || {
        folderType: 'new',
        currentIndex: 0,
      };
      await renderAdminOrderPage(
        ctx,
        state.folderType,
        state.currentIndex,
        true,
      );
    } catch (err) {
      ctx.answerCbQuery('Помилка');
    }
  });

  bot.action(/^adm_delete_(.+)$/, async ctx => {
    if (ctx.from.id !== adminId) return ctx.answerCbQuery();
    try {
      await Order.findByIdAndDelete(ctx.match[1]);
      ctx.answerCbQuery('Заявку повністю видалено');
      const state = adminStates[adminId] || {
        folderType: 'cancelled',
        currentIndex: 0,
      };
      await renderAdminOrderPage(
        ctx,
        state.folderType,
        state.currentIndex,
        true,
      );
    } catch (err) {
      console.error(err);
      ctx.answerCbQuery('Помилка при видаленні');
    }
  });

  // ============================================
  // КАЛЕНДАР ДАТ
  // ============================================

  async function showAdminDatePicker(ctx, startOfWeekDate = new Date()) {
    const calendarData = await getWeekDaysForCalendar('ua', startOfWeekDate);
    const inlineRows = [];

    inlineRows.push([
      Markup.button.callback(
        `Управління: ${calendarData.headerTitle}`,
        'admin_cal_noop',
      ),
    ]);

    const allDaysButtons = calendarData.days.map(day => {
      if (day.isPast)
        return Markup.button.callback(
          `⏳ (${day.dayNum})`,
          'admin_cal_past_error',
        );
      const label = day.isBlockedByAdmin
        ? `🔒 (${day.dayNum})`
        : `✅ ${day.dayLabel}(${day.dayNum})`;
      return Markup.button.callback(label, `admin_cal_toggle_${day.dateStr}`);
    });

    inlineRows.push([allDaysButtons[0], allDaysButtons[1], allDaysButtons[2]]);
    inlineRows.push([allDaysButtons[3], allDaysButtons[4], allDaysButtons[5]]);
    inlineRows.push([allDaysButtons[6]]);

    const navRow = [];
    if (calendarData.isPrevWeekPast) {
      navRow.push(Markup.button.callback('⛔️', 'admin_cal_noop'));
    } else {
      navRow.push(
        Markup.button.callback(
          '⬅️ Минулий тиждень',
          `admin_cal_nav_${calendarData.prevWeekStr}`,
        ),
      );
    }
    navRow.push(
      Markup.button.callback(
        'Наступний тиждень ➡️',
        `admin_cal_nav_${calendarData.nextWeekStr}`,
      ),
    );
    inlineRows.push(navRow);
    inlineRows.push([
      Markup.button.callback('↩️ Вийти з редагування', 'admin_cal_exit'),
    ]);

    return Markup.inlineKeyboard(inlineRows);
  }

  bot.action(/^admin_cal_nav_(.+)$/, async ctx => {
    if (ctx.from.id !== adminId) return ctx.answerCbQuery();
    const targetParts = ctx.match[1].split('-');
    const targetDate = new Date(
      targetParts[0],
      targetParts[1] - 1,
      targetParts[2],
    );
    ctx.answerCbQuery();
    const keyboard = await showAdminDatePicker(ctx, targetDate);
    ctx.editMessageReplyMarkup(keyboard.reply_markup).catch(() => {});
  });

  bot.action(/^admin_cal_toggle_(.+)$/, async ctx => {
    if (ctx.from.id !== adminId) return ctx.answerCbQuery();
    const clickedDateStr = ctx.match[1];
    const alreadyBlocked = await BlockedDate.findOne({
      dateStr: clickedDateStr,
    });

    if (alreadyBlocked) {
      await BlockedDate.deleteOne({ dateStr: clickedDateStr });
      ctx.answerCbQuery(`🔓 День ${clickedDateStr} знову вільний!`);
    } else {
      await BlockedDate.create({ dateStr: clickedDateStr });
      ctx.answerCbQuery(`🔒 День ${clickedDateStr} закрито для запису!`);
    }

    const targetParts = clickedDateStr.split('-');
    const targetDate = new Date(
      targetParts[0],
      targetParts[1] - 1,
      targetParts[2],
    );
    const keyboard = await showAdminDatePicker(ctx, targetDate);
    ctx.editMessageReplyMarkup(keyboard.reply_markup).catch(() => {});
  });

  bot.action('admin_cal_past_error', ctx =>
    ctx.answerCbQuery('⛔️ Не можна редагувати минулі дні!', {
      show_alert: true,
    }),
  );
  bot.action('admin_cal_noop', ctx => ctx.answerCbQuery());
  bot.action('admin_cal_exit', ctx => {
    ctx.answerCbQuery();
    ctx.editMessageText('Вийшли з режиму редагування дат.');
    showAdminMenu(ctx);
  });
};
