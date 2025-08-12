// index.js
import 'dotenv/config';
import { Telegraf, session } from 'telegraf';
import OpenAI from 'openai';

const BOT_TOKEN = process.env.BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_PROJECT = process.env.OPENAI_PROJECT; // ixtiyoriy: proj_...

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN yo‘q. Railway Variables’da qo‘shing.'); process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// --- OpenAI klienti (siz yuborgan bo‘lak shu yerda) ---
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  // agar sizda project ID bo'lsa (proj_...), qo'shib qo'yamiz
  project: process.env.OPENAI_PROJECT || undefined
});

// --- Sessiya/Guard ---
bot.use(session());
bot.use((ctx, next) => { ctx.session ??= {}; return next(); });

// --- Global error handler ---
bot.catch((err, ctx) => {
  console.error('Bot error for update', ctx.update?.update_id, err);
  try { ctx.reply('Serverda kichik nosozlik. Bir daqiqadan so‘ng qayta urinib ko‘ring.'); } catch {}
});

// --- Menyu (reply keyboard) ---
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

// --- START ---
bot.start(async (ctx) => {
  await ctx.reply(
    "Assalomu alaykum! Jon Branding’ga xush kelibsiz. Qulay yo'lni tanlang yoki savolingizni yozing:",
    replyMenu
  );
});

// --- Statik tugmalar ---
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

// ✅ Yangilangan Portfolio
bot.hears('📷 Portfolio', (ctx) =>
  ctx.reply(
    'To‘liq portfolio: https://t.me/JonBranding',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔗 Portfolio kanali', url: 'https://t.me/JonBranding' }]
        ]
      }
    }
  )
);

// ✅ Yangilangan Aloqa
bot.hears('☎️ Aloqa', (ctx) =>
  ctx.reply(
    'Telefon: +998 33 645 00 97\nTelegram: @baxtiyorjongaziyev\nIsh vaqti: Du–Shan 10:00–19:00',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📞 Qo‘ng‘iroq qilish', url: 'tel:+998336450097' }],
          [{ text: '✉️ Telegram yozish', url: 'https://t.me/baxtiyorjongaziyev' }]
        ]
      }
    }
  )
);

bot.hears('🗒️ Buyurtma (AI)', (ctx) =>
  ctx.reply('Qisqacha yozing: biznes nomi, paket, muddat, budjet, kontakt.', replyMenu)
);

// --- AI yordamchi (siz yuborgan blok bilan mos) ---
async function aiAnswer(text) {
  const system =
    "Sen Jon Branding agentligining AI-assistentisan. Ohang: do'stona, qisqa, ta'sirli. " +
    "Maqsad: paketlar/konsultatsiya/buyurtma bo'yicha yo'naltirish. Savollar ber va qisqa CTA bilan yakunla.";

  if (!OPENAI_API_KEY) throw { status: 401, message: 'OPENAI_API_KEY yo‘q' };

  const tryModels = ['gpt-4o-mini', 'gpt-4o']; // kerak bo'lsa keyin kengaytiramiz

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
      // loglarni boyitib qo'yamiz
      console.error('OpenAI error (model:', model, ')',
        'status:', e?.status,
        'message:', e?.message,
        'data:', e?.response?.data);
    }
  }
  throw lastErr;
}

async function aiReply(ctx, text) {
  if (!process.env.OPENAI_API_KEY) {
    await ctx.reply("AI kaliti o‘rnatilmagan. Admin tekshiradi.", replyMenu);
    return;
  }
  try {
    const answer = await aiAnswer(text);
    await ctx.reply(answer || 'Savolingizni biroz aniqroq yozing.', replyMenu);

    // minimal lead trigger
    if (/(buyurtma|bron|narx|paket|logo)/i.test(text)) {
      const contact = text.match(/@[\w_]+|\+?\d[\d\s\-]{7,}/)?.[0] || '-';
      await ctx.reply(`✔️ Yozib oldim. Kontakt: ${contact}. Menejer tez orada bog‘lanadi.`, replyMenu);
      // Keyingi bosqich: shu yerda Airtable/Webhook ga POST qilamiz
    }
  } catch (e) {
    const code = e?.status;
    let userMsg = "AI serverida nosozlik. Birozdan so‘ng qayta urinib ko‘ring.";
    if (code === 401) userMsg = "AI kaliti noto‘g‘ri yoki project mos emas. Admin tekshiradi.";
    else if (code === 403) userMsg = "Ushbu modelga ruxsat yo‘q. Boshqa modelni tanlash kerak.";
    else if (code === 404) userMsg = "Model topilmadi. Admin model nomini tekshiradi.";
    else if (code === 429) userMsg = "Limit/kvota tugagan. Tez orada yana urinib ko‘ring.";
    await ctx.reply(userMsg, replyMenu);
  }
}

// --- Har qanday matnni AI ga yo‘naltiramiz ---
bot.on('text', async (ctx) => {
  if (ctx.session?.form) ctx.session.form = null;
  await aiReply(ctx, ctx.message.text);
});

// --- Health check (ixtiyoriy) ---
bot.command('health', (ctx) => ctx.reply('OK ✅', replyMenu));

// --- Launch ---
bot.launch().then(() => console.log('JonGPTbot (AI) running...'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
