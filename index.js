// JonGPT — Gemini bilan voronka + Telegram Business DM qo'llab-quvvatlashi
import 'dotenv/config';
import { Telegraf, session } from 'telegraf';
import { GoogleGenerativeAI } from '@google/generative-ai';

const BOT_TOKEN = process.env.BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!BOT_TOKEN) { console.error('❌ BOT_TOKEN yo‘q'); process.exit(1); }
if (!GEMINI_API_KEY) { console.warn('⚠️ GEMINI_API_KEY yo‘q — Railway Variables’da kiriting.'); }

const bot = new Telegraf(BOT_TOKEN);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// ---------- Business helper (DM'lar uchun) ----------
function bcExtra(ctx) {
  const id =
    ctx.message?.business_connection_id ||
    ctx.callbackQuery?.message?.business_connection_id ||
    ctx.update?.business_connection?.id;
  return id ? { business_connection_id: id } : {};
}
async function sendMsg(ctx, text, extra = {}) {
  const chatId = ctx.chat?.id ?? ctx.from?.id;
  return ctx.telegram.sendMessage(chatId, text, { ...extra, ...bcExtra(ctx) });
}

// ---------- UI ----------
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
const consultKB = {
  reply_markup: {
    inline_keyboard: [
      [{ text: '📞 Bugun', callback_data: 'call_today' },
       { text: '📅 Ertaga', callback_data: 'call_tomorrow' }],
      [{ text: '🗓 Ushbu hafta', callback_data: 'call_week' }]
    ]
  }
};

// ---------- Session guard ----------
bot.use(session());
bot.use((ctx, next) => {
  ctx.session ??= {};
  ctx.session.data ??= { industry: null, pack: null, due: null, budget: null, contact: null };
  ctx.session.stage ??= 'industry';
  ctx.session.greeted ??= false;
  return next();
});

// ---------- Global error ----------
bot.catch((err, ctx) => {
  console.error('Bot error', ctx.update?.update_id, err);
  try { sendMsg(ctx, 'Serverda kichik nosozlik. Bir daqiqadan so‘ng qayta urinib ko‘ring.'); } catch {}
});

// ---------- Statik tugmalar ----------
bot.hears('📷 Portfolio', (ctx) =>
  sendMsg(ctx, 'To‘liq portfolio: https://t.me/JonBranding', {
    reply_markup: { inline_keyboard: [[{ text: '🔗 Portfolio kanali', url: 'https://t.me/JonBranding' }]] }
  })
);

bot.hears('☎️ Aloqa', (ctx) =>
  sendMsg(ctx, 'Telefon: +998 33 645 00 97\nTelegram: @baxtiyorjongaziyev\nIsh vaqti: Du–Shan 10:00–19:00', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📞 Qo‘ng‘iroq qilish', url: 'tel:+998336450097' }],
        [{ text: '✉️ Telegram yozish', url: 'https://t.me/baxtiyorjongaziyev' }]
      ]
    }
  })
);

bot.hears('📦 Paketlar', (ctx) =>
  sendMsg(ctx,
`Asosiy xizmatlar:
1) Logo
2) Logo + Korporativ uslub
3) Logo + KU + Brandbook

Qaysi biri mos? Agar aniq bo‘lmasa, “🗒️ Buyurtma (AI)” ni bosing.`,
    replyMenu
  )
);

bot.hears('📞 Konsultatsiya', (ctx) =>
  sendMsg(ctx, 'Qulay vaqtni tanlang yoki yozib yuboring (masalan: "Ertaga 11:30").', consultKB)
);

bot.hears('🗒️ Buyurtma (AI)', (ctx) =>
  sendMsg(ctx, 'Qisqacha yozing: soha, xizmat (Logo / Logo+KU / Full), muddat, budjet, kontakt.', replyMenu)
);

// ---------- Start ----------
bot.start(async (ctx) => {
  ctx.session = {
    data: { industry: null, pack: null, due: null, budget: null, contact: null },
    stage: 'industry',
    greeted: true
  };
  await sendMsg(ctx, "Assalomu alaykum! Qulay yo‘lni tanlang yoki qisqacha ehtiyojingizni yozing.", replyMenu);
  await askCurrentStage(ctx);
});

// ---------- Extractors ----------
function extractFacts(text) {
  const t = (text || '').toLowerCase();

  const contact = text.match(/@[\w_]+|\+?\d[\d\-\s]{7,}/)?.[0] || null;

  const due =
    (/(bugun|ertaga)/.test(t) && (t.includes('bugun') ? 'bugun' : 'ertaga')) ||
    (/(2-3 hafta|hafta|1 oy|oy)/.test(t) && (t.match(/2-3 hafta|hafta|1 oy|oy/)?.[0])) || null;

  const pack =
    (/\b(full|brandbook)\b/.test(t) && 'Full') ||
    (/logo\s*\+\s*ku/.test(t) && 'Logo+KU') ||
    (/\blogo\b/.test(t) && 'Logo') || null;

  const budget =
    (/\b(s|m|l)\b/.test(t) && t.match(/\b(s|m|l)\b/)?.[0].toUpperCase()) ||
    (/(arzon|o'rtacha|qimmat)/.test(t) && (t.match(/arzon|o'rtacha|qimmat/)?.[0])) || null;

  const industry =
    (/(fast ?food|restoran|kafe)/.test(t) && 'HoReCa') ||
    (/(onlayn|internet) do'kon|ecommerce/.test(t) && 'E-commerce') ||
    (/(ta'lim|kurs|o'quv markaz)/.test(t) && 'Education') ||
    (/(go'zallik|salon)/.test(t) && 'Beauty') || null;

  return { contact, due, pack, budget, industry };
}
function mergeData(dst, src) {
  return {
    industry: dst.industry || src.industry,
    pack: dst.pack || src.pack,
    due: dst.due || src.due,
    budget: dst.budget || src.budget,
    contact: dst.contact || src.contact
  };
}
function nextStage(data) {
  if (!data.industry) return 'industry';
  if (!data.pack) return 'pack';
  if (!data.due) return 'due';
  if (!data.budget) return 'budget';
  if (!data.contact) return 'contact';
  return 'done';
}
function promptByStage(stage) {
  switch (stage) {
    case 'industry': return "Sohangiz qaysi? (masalan: HoReCa, e-commerce, ta’lim, beauty...)";
    case 'pack':     return "Qaysi xizmat kerak? (Logo / Logo+KU / Full)";
    case 'due':      return "Muddat qancha? (bugun / ertaga / 2-3 hafta / 1 oy)";
    case 'budget':   return "Budjet oralig‘i? (S / M / L yoki arzon/o‘rtacha/qimmat)";
    case 'contact':  return "Kontakt raqam yoki @username qoldirasizmi?";
    default:         return null;
  }
}
async function askCurrentStage(ctx) {
  const q = promptByStage(ctx.session.stage);
  if (q) await sendMsg(ctx, q);
}

// ---------- Gemini (faqat erkin savolga qisqa yordam) ----------
async function aiAssist(ctx, userText) {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const system =
      "Siz Jon Branding AI-assistentisiz. Juda qisqa, 1-2 jumla. Foydalanuvchini paket tanlashga yoki kontakt berishga yo'naltiring.";
    const prompt = `${system}\n\nSavol: ${userText}`;
    const res = await model.generateContent(prompt);
    const text = res?.response?.text?.() || res?.response?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text?.trim()) await sendMsg(ctx, text.trim());
  } catch (e) {
    // jim — voronka ustuvor
  }
}

// ---------- Core router ----------
bot.on('text', async (ctx) => {
  const text = ctx.message.text?.trim() || '';

  // tez yo‘llar
  if (/suhbat|gaplash/i.test(text)) {
    await sendMsg(ctx, 'Qulay vaqtni tanlang yoki yozib yuboring (masalan: "Ertaga 11:30").', consultKB);
    return;
  }

  // ma’lumotlarni yig‘amiz
  const facts = extractFacts(text);
  ctx.session.data = mergeData(ctx.session.data, facts);
  ctx.session.stage = nextStage(ctx.session.data);

  if (ctx.session.stage !== 'done') {
    // bosqichli savol
    await askCurrentStage(ctx);
    // agar foydalanuvchi umumiy savol bergan bo‘lsa, qisqa AI javob ham chiqsin
    if (!facts.industry && !facts.pack && !facts.due && !facts.budget && !facts.contact) {
      await aiAssist(ctx, text);
    }
    return;
  }

  // DONE → yakuniy xulosa + CTA
  const p = ctx.session.data;
  const summary =
`✔️ Yozib oldim:
• Soha: ${p.industry}
• Xizmat: ${p.pack}
• Muddat: ${p.due}
• Budjet: ${p.budget}
• Kontakt: ${p.contact}

Keyingi qadamni tanlang:`;
  await sendMsg(ctx, summary, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🗒️ Buyurtmani tasdiqlash', callback_data: 'make_order' }],
        [{ text: '📞 Konsultatsiya', callback_data: 'call_pick' }]
      ]
    }
  });

  // keyingi suhbatda takror savollar bo‘lmasin
  ctx.session.stage = 'done';
});

// ---------- Callbacks ----------
bot.on('callback_query', async (ctx) => {
  const d = ctx.callbackQuery?.data;
  if (!d) return ctx.answerCbQuery();

  if (d === 'make_order') {
    await ctx.answerCbQuery('Buyurtma qabul qilindi ✅');
    await sendMsg(ctx, 'Rahmat! Menejer tez orada bog‘lanadi. Yana savol bo‘lsa, yozib qoldiring.');
    return;
  }

  if (d === 'call_pick') {
    await ctx.answerCbQuery();
    return sendMsg(ctx, 'Qulay vaqtni tanlang yoki yozib yuboring (masalan: "Ertaga 11:30").', consultKB);
  }

  if (d.startsWith('call_')) {
    const label = d === 'call_today' ? 'bugun' : d === 'call_tomorrow' ? 'ertaga' : 'ushbu hafta';
    ctx.session.data.due ??= label;
    await ctx.answerCbQuery('Tanlandi: ' + label);
    return sendMsg(ctx, 'Kontakt raqam yoki @username qoldirasizmi?');
  }

  await ctx.answerCbQuery();
});

// ---------- /start qayta (spam salomsiz) ----------
bot.command('health', (ctx) => sendMsg(ctx, 'OK ✅'));
bot.launch().then(() => console.log('JonGPTbot (Gemini/state) running...'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
