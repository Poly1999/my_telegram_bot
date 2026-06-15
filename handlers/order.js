const { Markup } = require('telegraf');
const locales = require('../locales');
const userSessions = require('../sessions');
const { getAvailableTimes, getWeekDaysForCalendar } = require('../utils/dates');

module.exports = bot => {
  const serviceKeyMap = {
    'Website (від 3 сторінок)': 'website',
    'Landing Page (односторінковий)': 'landing',
    'Telegram Bot': 'bot',
    'Website (3+ pages)': 'website',
    'Landing Page (one-page)': 'landing',
    'Website (от 3 страниц)': 'website',
    'Landing Page (одностраничный)': 'landing',
  };

  bot.hears(Object.keys(serviceKeyMap), ctx => {
    const userId = ctx.from.id;
    const lang = userSessions[userId]?.lang || 'ua';
    const t = locales[lang];
    const service = serviceKeyMap[ctx.message.text];
    userSessions[userId].service = service;

    const infoKey = {
      website: 'serviceInfoWebsite',
      landing: 'serviceInfoLanding',
      bot: 'serviceInfoBot',
    }[service];
    const nextLabel =
      lang === 'en' ? '➡️ Next' : lang === 'ru' ? '➡️ Далее' : '➡️ Далі';
    const backLabel = lang === 'en' ? '↩️ Back' : '↩️ Назад';

    ctx.reply(t[infoKey], {
      parse_mode: 'Markdown',
      ...Markup.keyboard([[nextLabel], [backLabel]]).resize(),
    });
  });

  bot.hears(['➡️ Далі', '➡️ Next', '➡️ Далее'], ctx => {
    const userId = ctx.from.id;
    const lang = userSessions[userId]?.lang || 'ua';
    const t = locales[lang];
    userSessions[userId].step = 'design';
    const backLabel = lang === 'en' ? '↩️ Back' : '↩️ Назад';
    ctx.reply(
      t.calcDesignQuestion,
      Markup.keyboard([[t.btnYes], [t.btnNo], [backLabel]]).resize(),
    );
  });

  bot.hears(['Я не знаю', "I don't know", 'Я не знаю'], ctx => {
    const userId = ctx.from.id;
    const lang = userSessions[userId]?.lang || 'ua';
    userSessions[userId].service = 'unknown';
    userSessions[userId].step = 'ask_business';
    ctx.reply(locales[lang].calcBusinessQuestion, Markup.removeKeyboard());
  });

  const yesLabels = ['Так', 'Yes', 'Да'];
  const noLabels = ['Ні', 'No', 'Нет'];

  bot.hears([...yesLabels, ...noLabels], ctx => {
    const userId = ctx.from.id;
    const lang = userSessions[userId]?.lang || 'ua';
    const session = userSessions[userId];
    if (!session || session.step !== 'design') return;

    session.hasDesign = yesLabels.includes(ctx.message.text);
    session.step = 'ask_business';
    ctx.reply(locales[lang].calcBusinessQuestion, Markup.removeKeyboard());
  });

  // 📅 АСИНХРОННЫЙ ИНЛАЙН-КАЛЕНДАРЬ КУБИКАМИ
  async function showDatePicker(ctx, lang, startOfWeekDate = new Date()) {
    const calendarData = await getWeekDaysForCalendar(lang, startOfWeekDate);
    const inlineRows = [];

    // 1. Шапка: Месяц и Год
    inlineRows.push([
      Markup.button.callback(calendarData.headerTitle, 'calendar_noop'),
    ]);

    // 2. Рендерим кубики дней с раздельной проверкой статуса
    const allDaysButtons = calendarData.days.map(day => {
      let label = `${day.dayLabel} (${day.dayNum})`;
      let callbackData = `calendar_select_${day.dateStr}`;

      if (day.isPast) {
        // Если день физически прошел (вчера и ранее)
        label = `🔒 (${day.dayNum})`;
        callbackData = 'calendar_past_error';
      } else if (day.isBlockedByAdmin) {
        // Если день в будущем, но закрыт тобой в админке
        label = `🔒 (${day.dayNum})`;
        callbackData = 'calendar_blocked_error';
      }

      return Markup.button.callback(label, callbackData);
    });

    // Распределяем кубики по рядам: 3, 3, 1
    inlineRows.push([allDaysButtons[0], allDaysButtons[1], allDaysButtons[2]]); // Пн, Вт, Ср
    inlineRows.push([allDaysButtons[3], allDaysButtons[4], allDaysButtons[5]]); // Чт, Пт, Сб
    inlineRows.push([allDaysButtons[6]]); // Вс

    // 3. Стрелочки навигации
    const navRow = [];
    if (calendarData.isPrevWeekPast) {
      navRow.push(Markup.button.callback('⛔️', 'calendar_noop'));
    } else {
      navRow.push(
        Markup.button.callback(
          '⬅️ Минулий тиждень',
          `calendar_nav_${calendarData.prevWeekStr}`,
        ),
      );
    }
    navRow.push(
      Markup.button.callback(
        'Наступний тиждень ➡️',
        `calendar_nav_${calendarData.nextWeekStr}`,
      ),
    );
    inlineRows.push(navRow);

    // 4. Кнопка ручного ввода даты
    const customDateBtnText = {
      ua: '✦ Інша дата',
      en: '✦ Custom date',
      ru: '✦ Другая дата',
    }[lang];
    inlineRows.push([
      Markup.button.callback(customDateBtnText, 'calendar_custom'),
    ]);

    return Markup.inlineKeyboard(inlineRows);
  }

  // ⏰ ТАЙМПІКЕР
  function showTimePicker(ctx, lang) {
    const userId = ctx.from.id;
    const selectedDate = userSessions[userId]?.date || null;
    const times = getAvailableTimes(lang, selectedDate);

    const timeButtons = times.map(time => {
      if (time.isPast) return [`🚫 ${time.label}`];
      return [time.label];
    });

    ctx.reply(locales[lang].askTime, {
      parse_mode: 'Markdown',
      ...Markup.keyboard(timeButtons).resize(),
    });
  }

  // Нажатие на "Обрати дату"
  bot.hears(['Обрати дату', 'Choose a date', 'Выбрать дату'], async ctx => {
    const userId = ctx.from.id;
    const lang = userSessions[userId]?.lang || 'ua';

    ctx.reply('⌛...', Markup.removeKeyboard()).then(async msg => {
      bot.telegram.deleteMessage(ctx.chat.id, msg.message_id).catch(() => {});
      const keyboard = await showDatePicker(ctx, lang, new Date());
      ctx.reply(locales[lang].askDate, { parse_mode: 'Markdown', ...keyboard });
    });
  });

  // --- ОБРАБОТКА ИНЛАЙН-КНОПОК КАЛЕНДАРЯ ---
  bot.action(/^calendar_nav_(.+)$/, async ctx => {
    const userId = ctx.from.id;
    const session = userSessions[userId];
    if (!session) return ctx.answerCbQuery();

    const lang = session.lang || 'ua';
    const targetParts = ctx.match[1].split('-');
    const targetDate = new Date(
      targetParts[0],
      targetParts[1] - 1,
      targetParts[2],
    );

    ctx.answerCbQuery();
    const keyboard = await showDatePicker(ctx, lang, targetDate);
    ctx
      .editMessageReplyMarkup(keyboard.reply_markup)
      .catch(err => console.error(err));
  });

  bot.action(/^calendar_select_(.+)$/, ctx => {
    const userId = ctx.from.id;
    const session = userSessions[userId];
    if (!session) return ctx.answerCbQuery();

    const lang = session.lang || 'ua';
    session.date = ctx.match[1];
    session.step = 'ask_time';

    ctx.answerCbQuery();

    const selectedDateLabels = {
      ua: '📌 Обрана дата',
      en: '📌 Selected date',
      ru: '📌 Выбранная дата',
    };
    const dateLabel = selectedDateLabels[lang] || selectedDateLabels['ua'];

    ctx
      .editMessageText(`${dateLabel}: *${session.date}*`, {
        parse_mode: 'Markdown',
      })
      .catch(() => {});
    showTimePicker(ctx, lang);
  });

  // 🛑 УВЕДОМЛЕНИЕ: ДЕНЬ В БУДУЩЕМ ЗАБЛОКИРОВАН АДМИНОМ (ПОЛИНОЙ)
  bot.action('calendar_blocked_error', ctx => {
    const userId = ctx.from.id;
    const lang = userSessions[userId]?.lang || 'ua';

    const messages = {
      ua: 'На жаль, у цей день Поліна не зможе провести консультацію. Будь ласка, оберіть іншу дату!',
      en: 'Unfortunately, Polina is unavailable on this day. Please choose another date!',
      ru: 'К сожалению, в этот день Полина не сможет провести консультацию. Пожалуйста, выберите другой день!',
    };

    ctx.answerCbQuery(messages[lang] || messages['ua'], { show_alert: true });
  });

  bot.action('calendar_past_error', ctx => {
    const userId = ctx.from.id;
    const lang = userSessions[userId]?.lang || 'ua';

    const errorText =
      {
        ua: 'Цей день вже минув. Будь ласка, оберіть актуальну дату зі списку!',
        en: 'This date has already passed. Please choose an upcoming date!',
        ru: 'Этот день уже прошёл. Пожалуйста, выберите актуальную дату!',
      }[lang] || 'Этот день уже прошёл.';

    ctx.answerCbQuery(errorText, { show_alert: true });
  });

  bot.action('calendar_noop', ctx => ctx.answerCbQuery());

  bot.action('calendar_custom', ctx => {
    const userId = ctx.from.id;
    const session = userSessions[userId];
    if (!session) return ctx.answerCbQuery();

    session.step = 'ask_custom_date';
    ctx.answerCbQuery();
    ctx.editMessageText(locales[session.lang || 'ua'].customDatePrompt, {
      parse_mode: 'Markdown',
    });
  });

  bot.on('text', (ctx, next) => {
    const userId = ctx.from.id;
    if (userId === Number(process.env.MY_CHAT_ID)) return next();
    const session = userSessions[userId];
    if (!session) return next();

    const lang = session.lang || 'ua';
    const t = locales[lang];

    if (session.step === 'ask_business') {
      session.business = ctx.message.text;
      session.step = null;
      const backLabel = lang === 'en' ? '↩️ Back' : '↩️ Назад';
      ctx.reply(t.consultationOffer, {
        parse_mode: 'Markdown',
        ...Markup.keyboard([[t.btnBook], [backLabel]]).resize(),
      });
      return;
    }

    if (session.step === 'ask_custom_date') {
      session.date = ctx.message.text;
      session.step = 'ask_time';
      showTimePicker(ctx, lang);
      return;
    }

    if (session.step === 'ask_contact') {
      session.contact = ctx.message.text;
      finishOrder(ctx, userId, lang, t);
      return;
    }

    if (session.step === 'ask_time') {
      const times = getAvailableTimes(lang, session.date);
      const blockedTime = times.find(
        ti => `🚫 ${ti.label}` === ctx.message.text,
      );
      if (blockedTime) {
        ctx.reply(t.timePastError);
        return;
      }

      const selectedTime = times.find(
        ti => ti.label === ctx.message.text && !ti.isPast,
      );
      if (selectedTime) {
        session.time = selectedTime.value;
        session.step = 'ask_contact';
        ctx.reply(t.askContact, {
          parse_mode: 'Markdown',
          ...Markup.keyboard([
            [Markup.button.contactRequest(t.shareContactBtn)],
          ])
            .resize()
            .oneTime(),
        });
        return;
      }
    }

    return next();
  });

  bot.on('contact', ctx => {
    const userId = ctx.from.id;
    const session = userSessions[userId];
    if (!session) return;

    const lang = session.lang || 'ua';
    session.contact = ctx.message.contact.phone_number;
    finishOrder(ctx, userId, lang, locales[lang]);
  });

  function finishOrder(ctx, userId, lang, t) {
    const session = userSessions[userId];
    const Order = require('../models/Order');

    ctx.reply(t.thankYou, Markup.removeKeyboard());

    const serviceNames = {
      website: 'Website',
      landing: 'Landing Page',
      bot: 'Telegram Bot',
    };
    const hasDesign = {
      ua: session.hasDesign ? 'Так' : 'Ні',
      en: session.hasDesign ? 'Yes' : 'No',
      ru: session.hasDesign ? 'Да' : 'Нет',
    }[lang];

    const summary = `🔔 Нова заявка!\n\nПослуга: ${serviceNames[session.service] || 'Не визначено'}\nЄ дизайн: ${hasDesign}\nБізнес: ${session.business}\nДата: ${session.date}\nЧас: ${session.time}\n📞 Контакт: ${session.contact}\nМова: ${lang.toUpperCase()}\nTelegram ID: ${userId}`;

    Order.create({
      userId,
      lang,
      service: session.service || 'unknown',
      hasDesign: session.hasDesign,
      business: session.business,
      date: session.date,
      time: session.time,
      contact: session.contact,
    })
      .then(() => bot.telegram.sendMessage(process.env.MY_CHAT_ID, summary))
      .catch(err => console.error('Помилка збереження:', err));

    userSessions[userId] = { lang };
  }
};
