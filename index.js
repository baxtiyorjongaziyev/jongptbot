// JonGPT — Gemini + state-machine + Business DM + Lead export (TG topic + Airtable) + Contact button
import 'dotenv/config';
import { Telegraf, session, Markup } from 'telegraf';
import { GoogleGenerativeAI } from '@google/generative-ai';

const BOT_TOKEN = process.env.BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Lead export env
const LEADS_CHAT_ID = process.env.LEADS_CHAT_ID;           // -100xxxxxxxxxx
const LEADS_TOPIC_ID = Number(process.env.LEADS_TOPIC_ID || 0); // message_thread_id
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TABLE = process.env.AIRTABLE_TABLE || 'Leads';

if (!BOT_TOKEN) { console.error('❌ BOT_TOKEN yo‘q'); process.exit(1); }
if (!GEMINI_API_KEY) { console.warn('⚠️ GEMINI_API_KEY yo‘q — Railway Variables’da kiriting.'); }

const bot = new Telegraf(BOT_TOKEN);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// ---------- UX/Help ----------
const AI_ASSIST = false; // erkin savollarda Gemini javobi (tartib uchun hozir o'chirilgan)

const PACK_HELP =
  "Paketlar:\n" +
  "• Logo — faqat logotip\n" +
  "• Logo+KU — logotip + korporativ uslub (brend rang/shrift/qoidalar)\n" +
  "• Full — Logo+KU + brandbook + social dizaynlar\n" +
  "Qaysi biri kerak? (Logo / Logo+KU / Full)";

const BUDGET_HELP =
  "Budjet o‘lchami:\n" +
  "• S — minimal\n• M — o‘rtacha\n• L — kengaytirilgan\n" +
  "Iltimos S/M/L dan birini tanlang.";

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
// Kontakt bosqichi uchun maxsus keyboard
const contactKB = Markup.keyboard([
  [Markup.button.contactRequest('📱 Kontaktimni yuborish')],
  ['↩️ Ortga', '❌ Bekor qilish']
]).resize();

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
    greeted: true,
    lastPrompt: null,
    lastPromptAt: 0
  };
  await sendMsg(ctx, "Assalomu alaykum! Qulay yo‘lni tanlang yoki qisqacha ehtiyojingizni yozing.", replyMenu);
  await askCurrentStage(ctx);
});

// ---------- Extractors ----------
function extractFacts(text) {
  const t = (text || '').toLowerCase();

  // Kontakt: @username yoki telefon
  let contact = text.match(/@[\w_]+|\+?\d[\d\s\-()]{7,}/)?.[0] || null;
  if (!contact) {
    const m = text.match(/kontakt\s+(@?\w{3,})/i);
    if (m) contact = m[1].startsWith('@') ? m[1] : '@' + m[1];
  }

  // Muddat
  const due =
    (/(bugun|ertaga)/.test(t) && (t.includes('bugun') ? 'bugun' : 'ertaga')) ||
    (/(2-3 hafta|1 oy|hafta|oy)/.test(t) && (t.match(/2-3 hafta|1 oy|hafta|oy/)?.[0])) || null;

  // Paket
  const pack =
    /\bfull\b/.test(t) ? 'Full' :
    /logo\s*\+\s*(ku|korporativ|uslub)/.test(t) ? 'Logo+KU' :
    /\blogo\b/.test(t) ? 'Logo' : null;

  // Budjet
  const budget =
    (/\b([sml])\b/i.test(text) ? text.match(/\b([sml])\b/i)[1].toUpperCase() : null) ||
    (text.match(/arzon|o'rtacha|qimmat/i)?.[0] || null);

  // Soha taxmini
  const industry =
    /(restoran|kafe|fast ?food)/i.test(t) ? 'HoReCa' :
    /(onlayn|internet).{0,5}do'?kon|e-?commerce/i.test(t) ? 'E-commerce' :
    /(ta'lim|kurs|o'quv markaz)/i.test(t) ? 'Education' :
    /(go'zallik|salon)/i.test(t) ? 'Beauty' : null;

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
    case 'industry': return { text: "Sohangiz qaysi? (masalan: HoReCa, e-commerce, ta’lim, beauty...)", extra: replyMenu };
    case 'pack':     return { text: "Qaysi xizmat kerak? (Logo / Logo+KU / Full)\n\n" + PACK_HELP, extra: replyMenu };
    case 'due':      return { text: "Muddat qancha? (bugun / ertaga / 2-3 hafta / 1 oy)", extra: replyMenu };
    case 'budget':   return { text: "Budjet oralig‘i? (S / M / L yoki arzon/o‘rtacha/qimmat)\n\n" + BUDGET_HELP, extra: replyMenu };
    case 'contact':  return { text: "📱 Kontakt raqam yoki @username qoldirasizmi?", extra: contactKB };
    default:         return null;
  }
}
async function askCurrentStage(ctx) {
  const now = Date.now();
  if (ctx.session.lastPrompt === ctx.session.stage && now - (ctx.session.lastPromptAt || 0) < 8000) return;
  const q = promptByStage(ctx.session.stage);
  if (q) {
    await sendMsg(ctx, q.text, q.extra);
    ctx.session.lastPrompt = ctx.session.stage;
    ctx.session.lastPromptAt = now;
  }
}

// ---------- Gemini (erkin savolga qisqa yordam) ----------
async function aiAssist(ctx, userText) {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const system =
      "Siz Jon Branding AI-assistentisiz. Juda qisqa, 1-2 jumla. Foydalanuvchini paket tanlashga yoki kontakt berishga yo'naltiring.";
    const prompt = `${system}\n\nSavol: ${userText}`;
    const res = await model.generateContent(prompt);
    const text = res?.response?.text?.() || res?.response?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text?.trim()) await sendMsg(ctx, text.trim());
  } catch {}
}

// ---------- Lead Export helpers ----------
function leadText(data, ctx) {
  const who = `${ctx.from?.first_name || ''} ${ctx.from?.last_name || ''}`.trim() || ctx.from?.username || ctx.from?.id;
  return (
`🆕 Yangi lead
👤 Mijoz: ${who} (@${ctx.from?.username || '-'})
📱 Kontakt: ${data.contact || '-'}
🏷 Soha: ${data.industry || '-'}
🧩 Xizmat: ${data.pack || '-'}
⏰ Muddat: ${data.due || '-'}
💰 Budjet: ${data.budget || '-'}
📨 Manba: Telegram Bot
🕒 ${new Date().toLocaleString('uz-UZ')}`
  );
}
async function sendLeadToTelegramTopic(ctx, data) {
  if (!LEADS_CHAT_ID || !LEADS_TOPIC_ID) return;
  try {
    await ctx.telegram.sendMessage(
      LEADS_CHAT_ID,
      leadText(data, ctx),
      { message_thread_id: LEADS_TOPIC_ID }
    );
  } catch (e) {
    console.error('TG topic lead error:', e?.message);
  }
}
async function sendLeadToAirtable(data, ctx) {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) return;
  try {
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE)}`;
    const fields = {
      Name: `${ctx.from?.first_name || ''} ${ctx.from?.last_name || ''}`.trim() || ctx.from?.username || `${ctx.from?.id}`,
      Username: ctx.from?.username || '',
      Contact: data.contact || '',
      Industry: data.industry || '',
      Package: data.pack || '',
      Due: data.due || '',
      Budget: data.budget || '',
      Source: 'Telegram Bot',
      Timestamp: new Date().toISOString()
    };
    await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ records: [{ fields }] })
    });
  } catch (e) {
    console.error('Airtable lead error:', e?.message);
  }
}
async function exportLead(ctx) {
  const p = ctx.session.data;
  await Promise.all([ sendLeadToTelegramTopic(ctx, p), sendLeadToAirtable(p, ctx) ]);
}

// ---------- Contact event (tugma bosilganda telefon) ----------
bot.on('contact', async (ctx) => {
  try {
    const phone = ctx.message?.contact?.phone_number;
    if (phone) {
      ctx.session.data.contact = phone;
      await sendMsg(ctx, `✔️ Kontakt oldim: ${phone}`, replyMenu);
    } else {
      await sendMsg(ctx, "Kontaktni ola olmadim. Iltimos, tugmani qayta bosing yoki raqamni yozing.");
    }
    ctx.session.stage = nextStage(ctx.session.data);
    if (ctx.session.stage !== 'done') {
      await askCurrentStage(ctx);
    } else {
      await finalizeLead(ctx);
    }
  } catch (e) {
    console.error('contact handler error', e?.message);
  }
});

// ---------- Core router ----------
bot.on('text', async (ctx) => {
  const text = ctx.message.text?.trim() || '';

  // Help savollari
  if (/ku nima|full nima/i.test(text)) { await sendMsg(ctx, PACK_HELP); return; }
  if (/(s ?m ?l nima|budjet nima|s nima|m nima|l nima)/i.test(text)) { await sendMsg(ctx, BUDGET_HELP); return; }

  // Tez yo‘llar
  if (/suhbat|gaplash/i.test(text)) {
    await sendMsg(ctx, 'Qulay vaqtni tanlang yoki yozib yuboring (masalan: "Ertaga 11:30").', consultKB);
    return;
  }

  // DONE bo‘lsa — takror savol bermaymiz
  if (ctx.session.stage === 'done') {
    await sendMsg(ctx, "Rahmat! Ma’lumot yozildi. Yana savol bo‘lsa yozing yoki “📞 Konsultatsiya” ni bosing.", replyMenu);
    return;
  }

  // Ma’lumotlarni yig‘amiz
  const facts = extractFacts(text);
  ctx.session.data = mergeData(ctx.session.data, facts);
  ctx.session.stage = nextStage(ctx.session.data);

  if (ctx.session.stage !== 'done') {
    await askCurrentStage(ctx);
    if (AI_ASSIST && !facts.industry && !facts.pack && !facts.due && !facts.budget && !facts.contact) {
      await aiAssist(ctx, text);
    }
    return;
  }

  // DONE → yakuniy xulosa + CTA + EXPORT
  await finalizeLead(ctx);
});

async function finalizeLead(ctx) {
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
  await exportLead(ctx);
  ctx.session.stage = 'done';
}

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
    return sendMsg(ctx, 'Kontakt raqam yoki @username qoldirasizmi?', contactKB);
  }

  await ctx.answerCbQuery();
});

// ---------- /id — guruh va topic ID ni olish uchun ----------
bot.command('id', async (ctx) => {
  const chatId = ctx.chat?.id;
  const threadId = ctx.message?.message_thread_id;
  await sendMsg(ctx, `Chat ID: ${chatId}\nTopic ID: ${threadId ?? '(topicda yuboring)'}`);
});

bot.command('health', (ctx) => sendMsg(ctx, 'OK ✅'));

bot.launch().then(() => console.log('JonGPTbot (Gemini/state + leads + contact-btn) running...'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
