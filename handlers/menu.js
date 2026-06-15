const { Markup } = require('telegraf');
const locales = require('../locales');
const userSessions = require('../sessions');

function showMainMenu(ctx, lang) {
  const t = locales[lang];
  ctx.reply(
    t.mainMenuTitle,
    Markup.keyboard([[t.priceBtn], [t.orderBtn]]).resize(),
  );
}

module.exports = bot => {
  // Ціни
  const priceLabels = ['💰 Ціни на послуги', '💰 Prices', '💰 Цены на услуги'];
  bot.hears(priceLabels, ctx => {
    const userId = ctx.from.id;
    const lang = userSessions[userId]?.lang || 'ua';
    const t = locales[lang];
    ctx.reply(t.pricesText, {
      parse_mode: 'Markdown',
      ...Markup.keyboard([
        [t.orderBtn],
        [
          {
            text:
              '↩️ ' +
              (lang === 'ua' ? 'Назад' : lang === 'en' ? 'Back' : 'Назад'),
          },
        ],
      ]).resize(),
    });
  });

  // Назад до меню
  const backLabels = ['↩️ Назад', '↩️ Back'];
  bot.hears(backLabels, ctx => {
    const userId = ctx.from.id;

    // Если это админ, мы не игнорируем его, а просто возвращаем панель управления
    if (userId === Number(process.env.MY_CHAT_ID)) {
      return ctx.reply(
        '🔧 Головне меню адміна:',
        Markup.keyboard([['Всі заявки', 'Коригування дат']]).resize(),
      );
    }

    const lang = userSessions[userId]?.lang || 'ua';
    showMainMenu(ctx, lang);
  });

  // Замовлення — вибір типу
  const orderLabels = [
    'Записатись на консультацію',
    'Book a consultation',
    'Записаться на консультацию',
  ];
  bot.hears(orderLabels, ctx => {
    const userId = ctx.from.id;
    const lang = userSessions[userId]?.lang || 'ua';
    const t = locales[lang];
    ctx.reply(
      t.calcTypeQuestion,
      Markup.keyboard([
        [t.typeWebsite, t.typeLanding],
        [t.typeBot, lang === 'en' ? "I don't know" : 'Я не знаю'],
        [lang === 'en' ? '↩️ Back' : '↩️ Назад'],
      ]).resize(),
    );
  });
};

module.exports.showMainMenu = showMainMenu;
