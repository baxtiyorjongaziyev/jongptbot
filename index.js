import 'dotenv/config';
import { Telegraf, Markup, session } from 'telegraf';

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use(session());

// --- helpers
const mainMenu = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback('📦 Paketlar', 'paketlar')],
    [Markup.button.callback('📝 Buyurtma', 'buyurtma')],
    [
      Markup.button.callback('📞 Konsultatsiya', 'konsult'),
      Markup.button.callback('🎯 Portfolio', 'portfolio')
    ],
    [Markup.button.callback('☎️ Aloqa', 'aloqa')]
  ]);

// --- /start handler
bot.start(async (ctx) => {
  await ctx.reply(
    "Assalomu alaykum! Jon Branding’ga xush kelibsiz.\nQuyidagidan tanlang:",
    mainMenu()
  );
});

// --- paketlar
bot.action('paketlar', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `Asosiy xizmatlar:\n1) Logo\n2) Logo + Korporativ uslub\n3) Logo + KU + Brandbook\n\nDavom etamizmi?`,
    mainMenu()
  );
});

// --- buyurtma (oddiy 5 bosqich)
const steps = ['name', 'pack', 'due', 'budget', 'contact'];
const q = {
  name: 'Biznes nomi?',
  pack: 'Qaysi paket? (Logo / Logo+KU / Full)',
  due: 'Muddat? (tez / 2-3 hafta / 1 oy)',
  budget: 'Budjet? (S / M / L)',
  contact: 'Kontakt raqam yoki @username?'
};

bot.action('buyurtma', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.form = { step: 0, data: {} };
  await ctx.reply(q[steps[0]]);
});

bot.on('text', async (ctx) => {
  if (!ctx.session.form) return;

  const { step, data } = ctx.session.form;
  const key = steps[step];
  data[key] = ctx.message.text.trim();

  if (step < steps.length - 1) {
    ctx.session.form.step += 1;
    const nextKey = steps[step + 1];
    await ctx.reply(q[nextKey]);
  } else {
    const summary =
      `Yangi lead:\n` +
      `• Nomi: ${data.name}\n` +
      `• Paket: ${data.pack}\n` +
      `• Muddat: ${data.due}\n` +
      `• Budjet: ${data.budget}\n` +
      `• Kontakt: ${data.contact}`;

    await ctx.reply('Rahmat! Ma’lumotlar qabul qilindi. Menejer tez orada bog‘lanadi.');
    await ctx.telegram.sendMessage(ctx.chat.id, summary);

    ctx.session.form = null;
    await ctx.reply('Bosh menyu', mainMenu());
  }
});

// --- konsult/portfolio/aloqa
bot.action('konsult', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `15 daqiqalik tezkor qo‘ng‘iroq uchun qulay kuningizni yozing (masalan: "Ertaga 11:30").`,
    mainMenu()
  );
});

bot.action('portfolio', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `So‘nggi ishlar: logolar, KU, brandbook.\nTo‘liq portfolio: jonbranding.uz/portfolio`,
    mainMenu()
  );
});

bot.action('aloqa', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `Telefon: +998 97 335 59 00\nTelegram: @baxtiyorjongaziyev\nIsh vaqti: Du–Shan 10:00–19:00`,
    mainMenu()
  );
});

bot.launch();
console.log('JonGPTbot running...');
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));