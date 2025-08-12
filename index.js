// index.js — Gemini (Google) bilan AI, bepul qatlamda ishlaydi
import 'dotenv/config';
import { Telegraf, session } from 'telegraf';
import { GoogleGenerativeAI } from '@google/generative-ai';

const BOT_TOKEN = process.env.BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; // Railway Variables’da bo‘ladi

if (!BOT_TOKEN) { console.error('❌ BOT_TOKEN yo‘q'); process.exit(1); }
if (!GEMINI_API_KEY) { console.warn('⚠️ GEMINI_API_KEY yo‘q — iltimos, Railway Variables’da kiriting.'); }

const bot = new Telegraf(BOT_TOKEN);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// --- Session & guard ---
bot.use(session());
bot.use((ctx, next) => { ctx.session ??= {}; return next(); });

// --- Global error handler ---
bot.catch((err, ctx) => {
  console.error('Bot error', ctx.update?.update_id, err);
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

// --- Start ---
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

// ✅ Yangilangan: Portfolio (Telegram kanal)
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

// ✅ Yangilangan: Aloqa (yangi raqam + call/DM tugmalari)
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

// --- Gemini AI yordamchi ---
async function aiAnswerGemini(userText) {
  if (!GEMINI_API_KEY) {
    throw Object.assign(new Error('GEMINI_API_KEY yo‘q'), { status: 401 });
  }
  const system =
    "Sen Jon Branding agentligining AI-assistentisan. Ohang: do'stona, qisqa, ta'sirli. " +
    "Maqsad: mijozni paketlar/konsultatsiya/buyurtma bo‘yicha yo‘naltirish. " +
    "Savollar ber va qisqa CTA bilan yakunla.";

  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  // Promptni soddalashtiramiz (Gemini formatiga mos)
  const prompt = `${system}\n\nFoydalanuvchi: ${userText}`;

  // Yengil rate-limitga chidamli backoff
  const tries = [0, 1000, 2000]; // 0s, 1s, 2s
  let lastErr;
  for (const wait of tries) {
    try {
      if (wait) await new Promise(r => setTimeout(r, wait));
      const result = await model.generateContent(prompt);
      const text = result?.response?.text?.() || result?.response?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text && text.trim()) return text.trim();
      lastErr = new Error('Empty Gemini response');
    } catch (e) {
      lastErr = e;
      // foydali log
      console.error('Gemini error:', e?.status ?? e?.code, e?.message);
      // 429/5xx bo‘lsa keyingi urinishga o‘tamiz
      if (!(e?.status === 429 || (e?.status >= 500 && e?.status < 600))) break;
    }
  }
  throw lastErr || new Error('Gemini failed');
}

async function aiReply(ctx, text) {
  try {
    const answer = await aiAnswerGemini(text);
    await ctx.reply(answer || 'Savolingizni biroz aniqroq yozing.', replyMenu);

    // Minimal lead trigger (keyingi bosqichda CRMga POST qilamiz)
    if (/(buyurtma|bron|narx|paket|logo)/i.test(text)) {
      const contact = text.match(/@[\w_]+|\+?\d[\d\s\-]{7,}/)?.[0] || '-';
      await ctx.reply(`✔️ Yozib oldim. Kontakt: ${contact}. Menejer tez orada bog‘lanadi.`, replyMenu);
    }
  } catch (e) {
    const code = e?.status || e?.code;
    let msg = "AI serverida nosozlik. Birozdan so‘ng qayta urinib ko‘ring.";
    if (code === 401) msg = "AI kaliti o‘rnatilmagan yoki noto‘g‘ri. Admin tekshiradi.";
    else if (code === 429) msg = "Hozir so‘rovlar limiti to‘ldi. 10–20 soniyadan so‘ng qayta yuboring.";
    await ctx.reply(msg, replyMenu);
  }
}

// --- Har qanday matnni AI ga yo‘naltiramiz ---
bot.on('text', async (ctx) => {
  if (ctx.session?.form) ctx.session.form = null;
  await aiReply(ctx, ctx.message.text);
});

// --- Health check ---
bot.command('health', (ctx) => ctx.reply('OK ✅', replyMenu));

// --- Launch ---
bot.launch().then(() => console.log('JonGPTbot (Gemini) running...'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
