// index.js — Gemini (Google) bilan AI, voronka yo'naltiruvchi, qisqa va takroriyliksiz
import 'dotenv/config';
import { Telegraf, session } from 'telegraf';
import { GoogleGenerativeAI } from '@google/generative-ai';

const BOT_TOKEN = process.env.BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!BOT_TOKEN) { console.error('❌ BOT_TOKEN yo‘q'); process.exit(1); }
if (!GEMINI_API_KEY) { console.warn('⚠️ GEMINI_API_KEY yo‘q — Railway Variables’da kiriting.'); }

const bot = new Telegraf(BOT_TOKEN);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// ----- Helpers: UI -----
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

// ----- Session guard -----
bot.use(session());
bot.use((ctx, next) => {
  ctx.session ??= {};
  ctx.session.profile ??= { industry: null, pack: null, due: null, budget: null, contact: null };
  ctx.session.greeted ??= false;
  ctx.session.thread ??= []; // so‘nggi xabarlar
  return next();
});

// ----- Global error handler -----
bot.catch((err, ctx) => {
  console.error('Bot error', ctx.update?.update_id, err);
  try { ctx.reply('Serverda kichik nosozlik. Bir daqiqadan so‘ng qayta urinib ko‘ring.'); } catch {}
});

// ----- Statik tugmalar -----
bot.hears('📦 Paketlar', (ctx) =>
  ctx.reply(
`Asosiy xizmatlar:
1) Logo
2) Logo + Korporativ uslub
3) Logo + KU + Brandbook

Qaysi biri sizga mos? Agar aniqmas bo‘lsa, “🗒️ Buyurtma (AI)” ni bosing.`,
    replyMenu
  )
);

bot.hears('📞 Konsultatsiya', (ctx) =>
  ctx.reply('Qulay vaqtni tanlang yoki yozib yuboring (masalan: "Ertaga 11:30").', consultKB)
);

bot.hears('📷 Portfolio', (ctx) =>
  ctx.reply(
    'To‘liq portfolio: https://t.me/JonBranding',
    { reply_markup: { inline_keyboard: [[{ text: '🔗 Portfolio kanali', url: 'https://t.me/JonBranding' }]] } }
  )
);

bot.hears('☎️ Aloqa', (ctx) =>
  ctx.reply(
    'Telefon: +998 33 645 00 97\nTelegram: @baxtiyorjongaziyev\nIsh vaqti: Du–Shan 10:00–19:00',
    { reply_markup: { inline_keyboard: [
      [{ text: '📞 Qo‘ng‘iroq qilish', url: 'tel:+998336450097' }],
      [{ text: '✉️ Telegram yozish', url: 'https://t.me/baxtiyorjongaziyev' }]
    ] } }
  )
);

bot.hears('🗒️ Buyurtma (AI)', (ctx) =>
  ctx.reply('Qisqacha yozing: soha, kerakli xizmat (Logo/Logo+KU/Full), muddat, budjet, kontakt.', replyMenu)
);

// ----- Start (takroriy salomsiz) -----
bot.start(async (ctx) => {
  ctx.session.greeted = true;
  ctx.session.thread = [];
  ctx.session.profile = { industry: null, pack: null, due: null, budget: null, contact: null };
  await ctx.reply("Assalomu alaykum! Qulay yo‘lni tanlang yoki qisqacha ehtiyojingizni yozing.", replyMenu);
});

// ----- Faktlarni avtomatik ajratish -----
function extractFacts(text) {
  const t = (text || '').toLowerCase();

  const contact = text.match(/@[\w_]+|\+?\d[\d\-\s]{7,}/)?.[0] || null;
  const due =
    (/(bugun|ertaga)/.test(t) && (t.includes('bugun') ? 'bugun' : 'ertaga')) ||
    (/(hafta|2-3 hafta|oy|1 oy)/.test(t) && (t.match(/2-3 hafta|hafta|1 oy|oy/)?.[0])) || null;

  const pack =
    (/\b(full|brandbook)\b/.test(t) && 'Full') ||
    (/logo\s*\+\s*ku/.test(t) && 'Logo+KU') ||
    (/\blogo\b/.test(t) && 'Logo') || null;

  const budget =
    (/\b(s|m|l)\b/.test(t) && t.match(/\b(s|m|l)\b/)?.[0].toUpperCase()) ||
    (/(arzon|o'rtacha|qimmat)/.test(t) && (t.match(/arzon|o'rtacha|qimmat/)?.[0])) || null;

  // sanoat/soha taxmin (soddalashtirilgan)
  const industry =
    (/(fast ?food|restoran|kafe)/.test(t) && 'HoReCa') ||
    (/(onlayn do'kon|ecommerce|internet do'kon)/.test(t) && 'E-commerce') ||
    (/(ta'lim|kurs)/.test(t) && 'Education') ||
    (/(go'zallik|salon)/.test(t) && 'Beauty') || null;

  return { contact, due, pack, budget, industry };
}

function mergeProfile(p, f) {
  return {
    industry: p.industry || f.industry,
    pack: p.pack || f.pack,
    due: p.due || f.due,
    budget: p.budget || f.budget,
    contact: p.contact || f.contact
  };
}

function nextMissing(p) {
  if (!p.industry) return 'industry';
  if (!p.pack) return 'pack';
  if (!p.due) return 'due';
  if (!p.budget) return 'budget';
  if (!p.contact) return 'contact';
  return null;
}

// ----- Gemini javob (kontekst + yo'nalish) -----
async function aiAnswerGemini(userText, session) {
  if (!GEMINI_API_KEY) throw Object.assign(new Error('GEMINI_API_KEY yo‘q'), { status: 401 });

  const p = session.profile;
  const known = [
    p.industry && `soha: ${p.industry}`,
    p.pack && `xizmat: ${p.pack}`,
    p.due && `muddat: ${p.due}`,
    p.budget && `budjet: ${p.budget}`,
    p.contact && `kontakt: ${p.contact}`
  ].filter(Boolean).join(', ');

  const need = nextMissing(p);
  const NEED_TO_ASK = need
    ? ({
        industry: "Sohangiz qaysi? (masalan: HoReCa, e-commerce, ta’lim...)",
        pack: "Qaysi xizmat kerak? (Logo / Logo+KU / Full)",
        due: "Muddat qancha? (bugun/ertaga/2-3 hafta/1 oy)",
        budget: "Budjet oralig‘i? (S / M / L)",
        contact: "Kontakt raqam yoki @username ni qoldiring."
      }[need])
    : null;

  const system =
    "Sen Jon Branding agentligining AI-assistentisan. Ohang: do'stona, qisqa, ta'sirli. " +
    "Takroriy salomlashuv yoki uzun kirishlardan qoch. Har javobda bittagina keyingi eng muhim savolni ber. " +
    "Ma'lumot yetarli bo'lsa CTA ber: Konsultatsiya/Buyurtma. 2-3 jumladan oshirma.";

  // Kontekstni qisqa saqlaymiz (so‘nggi 6 xabar)
  const last6 = session.thread.slice(-6).map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
  const prompt =
`${system}
Ma'lum faktlar: ${known || '—'}
Keyingi kerakli maydon: ${need || '—'}

Suhbat (oxirgi 6 xabar):
${last6}

Foydalanuvchi: ${userText}

Ko'rsatma:
- 1-2 jumla bilan aniq javob ber.
- Agar kerakli maydon yetishmasa, faqat o'shani so'ra.
- Agar ma'lumot yetarli bo'lsa, CTA: “📞 Konsultatsiya” yoki “🗒️ Buyurtma (AI)”ga yo'naltir.
`;

  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  // yengil backoff
  const delays = [0, 800, 1600];
  let lastErr;
  for (const d of delays) {
    try {
      if (d) await new Promise(r => setTimeout(r, d));
      const result = await model.generateContent(prompt);
      const text = result?.response?.text?.() || result?.response?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text && text.trim()) return text.trim();
      lastErr = new Error('Empty Gemini response');
    } catch (e) {
      lastErr = e;
      const code = e?.status || e?.code;
      console.error('Gemini error', code, e?.message);
      if (!(code === 429 || (code >= 500 && code < 600))) break;
    }
  }
  throw lastErr || new Error('Gemini failed');
}

// ----- AI router -----
async function aiReply(ctx, userText) {
  // Dedupe bir xil xabar
  if (ctx.session.lastUserText === userText) {
    return ctx.reply('Tushundim. Bitta savol: ' + (
      nextMissing(ctx.session.profile) === 'contact'
        ? 'Kontakt raqam yoki @username qoldirasizmi?'
        : 'Qaysi paketni tanlaysiz: Logo / Logo+KU / Full?'
    ));
  }
  ctx.session.lastUserText = userText;

  // Faktlarni yig'amiz
  const facts = extractFacts(userText);
  ctx.session.profile = mergeProfile(ctx.session.profile, facts);

  // Threadga qo‘shamiz (kontekst uchun)
  ctx.session.thread.push({ role: 'user', content: userText });

  try {
    const answer = await aiAnswerGemini(userText, ctx.session);
    ctx.session.thread.push({ role: 'assistant', content: answer });
    await ctx.reply(answer);

    // Agar kontakt + kamida bitta asosiy maydon bo'lsa, leadni tasdiqlash
    const p = ctx.session.profile;
    if (p.contact && (p.pack || p.industry)) {
      const summary =
`✔️ Yozib oldim:
• Soha: ${p.industry || '-'}
• Xizmat: ${p.pack || '-'}
• Muddat: ${p.due || '-'}
• Budjet: ${p.budget || '-'}
• Kontakt: ${p.contact || '-'}

Agar to‘g‘ri bo‘lsa, “🗒️ Buyurtma (AI)” tugmasi orqali yakunlaymiz yoki “📞 Konsultatsiya” ni bosing.`;
      await ctx.reply(summary);
    }
  } catch (e) {
    const code = e?.status || e?.code;
    let msg = "AI serverida nosozlik. Birozdan so‘ng qayta urinib ko‘ring.";
    if (code === 401) msg = "AI kaliti o‘rnatilmagan yoki noto‘g‘ri. Admin tekshiradi.";
    else if (code === 429) msg = "Hozir so‘rovlar limiti to‘ldi. 10–20 soniyadan so‘ng qayta yuboring.";
    await ctx.reply(msg);
  }
}

// ----- Text handler -----
bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();

  // Startda bir marta salomlashamiz, keyin takrorlamaymiz
  if (!ctx.session.greeted && /salom|assalomu/i.test(text)) {
    ctx.session.greeted = true;
    return ctx.reply("Salom! Qisqacha ehtiyojingizni yozing: soha, xizmat, muddat, budjet, kontakt.", replyMenu);
  }

  // “suhbatlashmoqchiman” → konsult CTA
  if (/suhbat|gaplash/i.test(text)) {
    return ctx.reply('Ajoyib! Qulay vaqtni tanlang yoki yozib yuboring (masalan: "Ertaga 11:30").', consultKB);
  }

  // AIga yo'naltiramiz
  await aiReply(ctx, text);
});

// ----- Callbacklar (konsult vaqt) -----
bot.on('callback_query', async (ctx) => {
  const d = ctx.callbackQuery.data;
  if (d?.startsWith('call_')) {
    const label = d === 'call_today' ? 'bugun' : d === 'call_tomorrow' ? 'ertaga' : 'ushbu hafta';
    ctx.session.profile.due ??= label;
    await ctx.answerCbQuery('Tanlandi: ' + label);
    await ctx.reply('Kontakt raqam yoki @username qoldirasizmi?');
  } else {
    await ctx.answerCbQuery();
  }
});

// ----- Health -----
bot.command('health', (ctx) => ctx.reply('OK ✅'));

// ----- Launch -----
bot.launch().then(() => console.log('JonGPTbot (Gemini) running...'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
