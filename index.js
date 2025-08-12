// index.js
import 'dotenv/config';
import { Telegraf, session } from 'telegraf';
import OpenAI from 'openai';

// --- Bot va OpenAI ---
const bot = new Telegraf(process.env.BOT_TOKEN);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- Session doim mavjud bo'lsin ---
bot.use(session());
bot.use((ctx, next) => {
  ctx.session ??= {};
  return next();
});

// --- Global error handler (bot yiqilmasin) ---
bot.catch((err, ctx) => {
  console.error('Bot error for update', ctx.update?.update_id, err);
  try { ctx.reply('Serverda kichik nosozlik. Bir daqiqadan so‘ng qayta urinib ko‘ring.'); } catch {}
});

// --- Start / menyu ---
const replyMenu = {
  reply_markup: {
    keyboard: [
      ['📦 Paketlar', '🗒️ Buyurtma (AI)'],
      ['📞 Konsultatsiya', '📷 Portfolio'],
      ['☎️ Aloqa']
    ],
    resize_keyboard: true
  }
};

bot.start(async (ctx) => {
  await ctx.reply(
    "Assalomu alaykum! Jon Branding’ga xush kelibsiz. Qulay yo'lni tanlang yoki savolingizni yozing:",
    replyMenu
  );
});

// --- Statik javoblar (tugmalar) ---
bot.hears('📦 Paketlar', (ctx) =>
  ctx.reply(
    `Asosiy xizmatlar:
1) Logo
2) Logo + Korporativ uslub
3) Logo + KU + Brandbook

Savolingizni yozing yoki “🗒️ Buyurtma (AI)” ni bosing.`,
    replyMenu
  )
);

bot.hears('📞 Konsultatsiya', (ctx) =>
  ctx.reply(
    '15 daqiqalik qo‘ng‘iroq uchun qulay vaqtni yozing (masalan: "Ertaga 11:30"). AI menedjerimiz yordam beradi.',
    replyMenu
  )
);

bot.hears('📷 Portfolio', (ctx) =>
  ctx.reply(
    'So‘nggi ishlar: logolar, KU, brandbook.\nTo‘liq portfolio: jonbranding.uz/portfolio',
    replyMenu
  )
);

bot.hears('☎️ Aloqa', (ctx) =>
  ctx.reply(
    'Telefon: +998 97 335 59 00\nTelegram: @baxtiyorjongaziyev\nIsh vaqti: Du–Shan 10:00–19:00',
    replyMenu
  )
);

bot.hears('🗒️ Buyurtma (AI)', (ctx) =>
  ctx.reply(
    'Buyurtma uchun qisqa yozing: biznes nomi, paket, muddat, budjet, kontakt. AI menedjerimiz yordam beradi.',
    replyMenu
  )
);

// --- AI javob funksiyasi ---
async function aiReply(ctx, text) {
  const system =
    "Sen Jon Branding agentligining AI-assistentisan. Ohang: do'stona, qisqa va ta'sirli. " +
    "Maqsad: mijozni ehtiyojiga qarab yo'naltirish (paketlar, konsultatsiya, buyurtma). " +
    "Kerak bo'lsa savollar berib, qisqa CTA bilan yakunla.";

  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.4,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: text }
    ]
  });

  const answer = res.choices?.[0]?.message?.content?.trim() || 'Savolingizni biroz aniqroq yozing.';
  await ctx.reply(answer, replyMenu);

  // Minimal lead trigger (keyingi bosqichda CRMga yozamiz)
  if (/(buyurtma|bron|narx|paket|logo)/i.test(text)) {
    const contact = text.match(/@[\w_]+|\+?\d[\d\s\-]{7,}/)?.[0] || '-';
    await ctx.reply(
      `✔️ Yozib oldim. Kontakt: ${contact}. Menejer tez orada bog‘lanadi.`,
      replyMenu
    );
  }
}

// --- Matnlar uchun AI router ---
bot.on('text', async (ctx) => {
  // eski form bo'lsa tozalaymiz
  if (ctx.session?.form) ctx.session.form = null;

  try {
    await aiReply(ctx, ctx.message.text);
  } catch (e) {
    console.error(e);
    await ctx.reply('Serverda kichik nosozlik. Bir daqiqadan so‘ng qayta urinib ko‘ring.');
  }
});

// --- Ishga tushirish ---
bot.launch().then(() => console.log('JonGPTbot (AI) running...'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
