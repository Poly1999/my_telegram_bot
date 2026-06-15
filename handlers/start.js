const { Markup } = require('telegraf');
const locales = require('../locales');
const userSessions = require('../sessions');
const { showMainMenu } = require('./menu');

module.exports = bot => {
  bot.start(ctx => {
    const userId = ctx.from.id;
    const adminId = Number(process.env.MY_CHAT_ID);

    if (userId === adminId) {
      const t = locales.ua;
      // Убираем старую клавиатуру и ставим новую с корректировкой дат!
      ctx.reply(
        t.adminWelcome || '👋 Ласкаво просимо до панелі адміністратора:',
        Markup.keyboard([['Всі заявки', 'Коригування дат']]).resize(),
      );
    } else {
      ctx.reply(
        '🌐 Оберіть мову / Choose language / Выберите язык:',
        Markup.inlineKeyboard([
          [Markup.button.callback('Українська', 'set_lang_ua')],
          [Markup.button.callback('English', 'set_lang_en')],
          [Markup.button.callback('Русский', 'set_lang_ru')],
        ]),
      );
    }
  });

  ['ua', 'en', 'ru'].forEach(lang => {
    bot.action(`set_lang_${lang}`, ctx => {
      const userId = ctx.from.id;
      userSessions[userId] = { lang };
      ctx.answerCbQuery();
      const t = locales[lang];
      ctx.reply(t.welcome).then(() => showMainMenu(ctx, lang));
    });
  });
};
