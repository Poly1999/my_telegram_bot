require('dotenv').config();

const { Telegraf } = require('telegraf');
const connectDB = require('./db');

const bot = new Telegraf(process.env.BOT_TOKEN);

require('./handlers/start')(bot);
require('./handlers/menu')(bot);
require('./handlers/order')(bot);
require('./handlers/admin')(bot);

bot.launch();

console.log('Bot started! ✅');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
