// index.js
import 'dotenv/config';
import { Telegraf, session } from 'telegraf';
import OpenAI from 'openai';

const BOT_TOKEN = process.env.BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN yo‘q. Railway Variables’da qo‘shing.');
  process.exit(1);
}
if (!OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY yo‘q. Railway Variables’da qo‘shing.');
  // chiqib ketmaymiz, lekin AI chaqirilganda foydalanuvchiga tushuntiramiz
}

const bot = new Telegraf(BOT_TOKEN);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// --- Session har doim mavjud bo‘lsin
bot.use(session());
bot.use((ctx, next) => {
  ctx.session ??= {};
  return next();
});

// --- Global error handler
bot.catch((err, ctx) => {
  console.error('Bot error for update', ctx.update?.update_id, err);
  try { ctx.reply('Serverda kichik nosozlik. Bir daqiqadan so‘ng qayta urinib ko‘ring.'); } catch {}
});

// --- Qisqa brend menyu
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

// --- Start
bot.start(async (ctx) => {
  await ctx.reply(
    "Assalomu alaykum! Jon Branding’ga xush kelibsiz. Qulay yo'lni tanlang yoki savolingizni yozing:",
    replyMenu
  );
});

// --- Statik tugmalar
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
  ctx.reply('Qulay vaqtni yozing (masalan: "Ertaga 11:30"). AI menedjer yordam beradi.', replyMenu)
);

bot.hears('📷 Portfolio', (ctx) =>
  ctx.reply('To‘liq portfolio: https://t.me/JonBranding', replyMenu)
);

bot.hears('☎️ Aloqa', (ctx) =>
  ctx.reply('Telefon: +998 97 335 59 00\nTelegram: @baxtiyorjongaziyev\nIsh vaqti: Du–Shan 10:00–19:00', replyMenu)
);

bot.hears('🗒️ Buyurtma (AI)', (ctx) =>
  ctx.reply('Qisqacha yozing: biznes nomi, paket, muddat, budjet, kontakt.', replyMenu)
);

// --- AI javob (fallback bilan)
async function aiAnswer(text) {
  const system =
    "Sen Jon Branding agentligining AI-assistentisan. Ohang: do'stona, qisqa va ta'sirli. " +
    "Maqsad: mijozni ehtiyojiga qarab yo'naltirish (paketlar, konsultatsiya, buyurtma). " +
    "Kerak bo'lsa savollar berib, qisqa CTA bilan yakunla.";

  // 1-urinish: gpt-4o-mini, 2-urinish: gpt-4o
  const tryModels = ['gpt-4o-mini', 'gpt-4o'];
  let lastErr;
  for (const model of tryModels) {
    try {
      const res = await openai.chat.completions.create({
        model,
        temperature: 0.4,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: text }
        ]
      });
      return res.choices?.[0]?.message?.content?.trim() || '';
    } catch (e) {
      lastErr = e;
      // keyingisiga o‘tamiz
    }
  }
  throw lastErr;
}

async function aiReply(ctx, text) {
  if (!OPENAI_API_KEY) {
    await ctx.reply("AI kaliti o‘rnatilmagan. Iltimos, administrator bilan bog‘laning.", replyMenu);
    return;
  }

  try {
    const answer = await aiAnswer(text);
    const contact = text.match(/@[\w_]+|\+?\d[\d\s\-]{7,}/)?.[0];

    await ctx.reply(answer || 'Savolingizni biroz aniqroq yozing.', replyMenu);

    if (/(buyurtma|bron|narx|paket|logo)/i.test(text)) {
      await ctx.reply(`✔️ Yozib oldim. Kontakt: ${contact || '-'}. Menejer tez orada bog‘lanadi.`, replyMenu);
      // Keyingi bosqich: shu yerda Airtable/Webhook ga POST qilamiz
    }
  } catch (e) {
    // foydali log
    console.error('OpenAI error:', e?.status, e?.message, e?.response?.data);
    const msg = e?.status === 401
      ? "AI kaliti noto‘g‘ri yoki muddati tugagan. Admin tekshiradi."
      : "AI serverida nosozlik. Birozdan so‘ng qayta urinib ko‘ring.";
    await ctx.reply(msg, replyMenu);
  }
}

// --- AI router (har qanday matn)
bot.on('text', async (ctx) => {
  if (ctx.session?.form) ctx.session.form = null; // eskirgan flow bo‘lsa tozalaymiz
  await aiReply(ctx, ctx.message.text);
});

// --- Health check (ixtiyoriy)
bot.command('health', (ctx) => ctx.reply('OK ✅', replyMenu));

// --- Launch
bot.launch().then(() => console.log('JonGPTbot (AI) running...'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
