// JonGPT (Node.js) — Gemini Free Tier + Telegraf + CRM topic export (no Airtable)
require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');

const BOT_TOKEN = process.env.BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const LEADS_CHAT_ID = process.env.LEADS_CHAT_ID;           // -1002566480563
const LEADS_TOPIC_ID = Number(process.env.LEADS_TOPIC_ID); // 52

if (!BOT_TOKEN) { console.error('❌ BOT_TOKEN yo‘q'); process.exit(1); }
if (!GEMINI_API_KEY) console.warn('⚠️ GEMINI_API_KEY yo‘q — AI javobi ishlamasligi mumkin');

const bot = new Telegraf(BOT_TOKEN);

// ---------- Helpers ----------
const contactKB = Markup.keyboard([
  [Markup.button.contactRequest('📱 Kontaktimni yuborish')],
  ['❌ Bekor qilish']
]).resize();

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

function nextStage(data) {
  if (!data.pack) return 'pack';
  if (!data.due) return 'due';
  if (!data.budget) return 'budget';
  if (!data.contact) return 'contact';
  return 'done';
}

function promptByStage(stage) {
  switch (stage) {
    case 'pack':
      return {
        text:
`Qaysi paket sizga mos?
1) Naming
2) Logo
3) Korporativ uslub (KU)
4) Brandbook

Qisqacha yozing: masalan "Logo" yoki "Full emas, Logo+KU".`,
        extra: replyMenu
      };
    case 'due':
      return { text: "Muddat qancha? (bugun / ertaga / 2-3 hafta / 1 oy)", extra: replyMenu };
    case 'budget':
      return { text: "Budjet oralig‘i? (S/M/L yoki arzon/o‘rtacha/qimmat)", extra: replyMenu };
    case 'contact':
      return { text: "📱 Kontakt raqam yoki @username qoldirasizmi?", extra: contactKB };
    default:
      return null;
  }
}

function extractFacts(text) {
  const t = (text || '').toLowerCase();
  const pack =
    /(naming)/i.test(text) ? 'Naming' :
    /(logo\s*\+\s*(ku|korporativ|uslub)|logo\+ku)/i.test(text) ? 'Logo+KU' :
    /\blogo\b/i.test(text) ? 'Logo' :
    /(brandbook)/i.test(text) ? 'Brandbook' : null;

  const due =
    (/(bugun|ertaga)/.test(t) && (t.includes('bugun') ? 'bugun' : 'ertaga')) ||
    (/(2-3 hafta|1 oy|hafta|oy)/.test(t) && (t.match(/2-3 hafta|1 oy|hafta|oy/)?.[0])) || null;

  const budget =
    (/\b([sml])\b/i.test(text) ? text.match(/\b([sml])\b/i)[1].toUpperCase() : null) ||
    (text.match(/arzon|o'rtacha|qimmat/i)?.[0] || null);

  let contact = text.match(/@[\w_]+|\+?\d[\d\s\-()]{7,}/)?.[0] || null;
  if (!contact) {
    const m = text.match(/kontakt\s+(@?\w{3,})/i);
    if (m) contact = m[1].startsWith('@') ? m[1] : '@' + m[1];
  }
  return { pack, due, budget, contact };
}

function mergeData(dst, src) {
  return {
    pack: dst.pack || src.pack,
    due: dst.due || src.due,
    budget: dst.budget || src.budget,
    contact: dst.contact || src.contact
  };
}

function leadText(p, ctx) {
  const who = `${ctx.from?.first_name || ''} ${ctx.from?.last_name || ''}`.trim() || ctx.from?.username || ctx.from?.id;
  return (
`🆕 Yangi lead
👤 Mijoz: ${who} (@${ctx.from?.username || '-'})
🧩 Xizmat: ${p.pack || '-'}
⏰ Muddat: ${p.due || '-'}
💰 Budjet: ${p.budget || '-'}
📱 Kontakt: ${p.contact || '-'}
📨 Manba: Telegram Bot
🕒 ${new Date().toLocaleString('uz-UZ')}`
  );
}

async function exportLeadToTopic(ctx, data) {
  if (!LEADS_CHAT_ID || !LEADS_TOPIC_ID) return;
  try {
    await ctx.telegram.sendMessage(
      LEADS_CHAT_ID,
      leadText(data, ctx),
      { message_thread_id: LEADS_TOPIC_ID }
    );
  } catch (e) {
    console.error('CRM topic error:', e?.message);
  }
}

// ---------- Gemini (Free Tier) ----------
async function geminiReply(userText) {
  if (!GEMINI_API_KEY) return null;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const body = {
      contents: [{
        parts: [{
          text:
`Sen Jon.Branding maslahatchi-assistentisan: qisqa, samimiy, tiqishtirmasdan yo'naltirasan.
Landingdagi USPlar:
- Strategik yondashuv, shaffof jarayon, natija va sadoqat.
- Paketlar: 0) Naming, 1) Logo, 2) Korporativ uslub, 3) Brandbook.
Maqsad: mijoz ehtiyojini aniqlash -> mos paket tavsiya -> muloyim CTA (kontakt).
Foydalanuvchi matni: ${userText}`
        }]
      }]
    };
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    const text = j?.candidates?.[0]?.content?.parts?.[0]?.text;
    return text?.trim() || null;
  } catch (e) {
    console.error('Gemini error:', e?.message);
    return null;
  }
}

// ---------- Session ----------
bot.use(session());
bot.use((ctx, next) => {
  ctx.session ??= {};
  ctx.session.data ??= { pack: null, due: null, budget: null, contact: null };
  ctx.session.stage ??= 'pack';
  return next();
});

// ---------- Commands & static ----------
bot.start(async (ctx) => {
  ctx.session = { data: { pack: null, due: null, budget: null, contact: null }, stage: 'pack' };
  await ctx.reply("Assalomu alaykum! Qisqa savollar bilan ehtiyojingizni aniqlayman. Boshladik. ✅", replyMenu);
  const q = promptByStage('pack');
  await ctx.reply(q.text, q.extra);
});

bot.hears('📷 Portfolio', (ctx) =>
  ctx.reply('To‘liq portfolio: https://t.me/JonBranding', {
    reply_markup: { inline_keyboard: [[{ text: '🔗 Portfolio kanali', url: 'https://t.me/JonBranding' }]] }
  })
);

bot.hears('☎️ Aloqa', (ctx) =>
  ctx.reply('Telefon: +998 33 645 00 97\nTelegram: @baxtiyorjongaziyev\nIsh vaqti: Du–Shan 10:00–19:00', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📞 Qo‘ng‘iroq qilish', url: 'tel:+998336450097' }],
        [{ text: '✉️ Telegram yozish', url: 'https://t.me/baxtiyorjongaziyev' }]
      ]
    }
  })
);

bot.hears('📦 Paketlar', (ctx) => {
  const q = promptByStage('pack');
  ctx.reply(q.text, q.extra);
});

bot.hears('📞 Konsultatsiya', (ctx) =>
  ctx.reply('Qulay vaqtni yozing (masalan: "Ertaga 11:30").', replyMenu)
);

bot.hears('🗒️ Buyurtma (AI)', (ctx) =>
  ctx.reply('Qisqacha yozing: xizmat (Naming/Logo/KU/Brandbook), muddat, budjet, kontakt.', replyMenu)
);

// ---------- Contact handler ----------
bot.on('contact', async (ctx) => {
  const phone = ctx.message?.contact?.phone_number;
  if (phone) {
    ctx.session.data.contact = phone;
    await ctx.reply(`✔️ Kontakt oldim: ${phone}`, replyMenu);
  } else {
    await ctx.reply('Kontaktni ola olmadim. Tugmani qayta bosing yoki raqamni yozing.');
  }
  ctx.session.stage = nextStage(ctx.session.data);
  if (ctx.session.stage === 'done') return finalize(ctx);
  const q = promptByStage(ctx.session.stage);
  await ctx.reply(q.text, q.extra);
});

// ---------- Text router (AI + state) ----------
bot.on('text', async (ctx) => {
  const text = ctx.message.text?.trim() || '';

  // Tez izohlar
  if (/ku nima|full nima/i.test(text)) {
    await ctx.reply("• Naming — nomlash xizmati\n• Logo — logotip dizayni\n• KU — ranglar/shriftlar tizimi\n• Brandbook — to‘liq qo‘llanma");
    return;
  }
  if (/(s ?m ?l nima|budjet nima|s nima|m nima|l nima)/i.test(text)) {
    await ctx.reply("Budjet o‘lchami: S—minimal, M—o‘rtacha, L—kengaytirilgan. Tanlang yoki arzon/o‘rtacha/qimmat deb yozing.");
    return;
  }

  // State update
  const before = ctx.session.stage;
  const facts = extractFacts(text);
  ctx.session.data = mergeData(ctx.session.data, facts);
  ctx.session.stage = nextStage(ctx.session.data);
  const after = ctx.session.stage;

  // AI javobi (maslahatchi ohang)
  const ai = await geminiReply(text);
  if (ai) await ctx.reply(ai);

  if (after !== 'done') {
    if (after !== before) {
      const q = promptByStage(after);
      if (q) await ctx.reply(q.text, q.extra);
    }
    return;
  }
  await finalize(ctx);
});

async function finalize(ctx) {
  const p = ctx.session.data;
  const summary =
`✔️ Yozib oldim:
• Xizmat: ${p.pack}
• Muddat: ${p.due}
• Budjet: ${p.budget}
• Kontakt: ${p.contact}

Rahmat! Menejer tez orada bog‘lanadi.`;
  await ctx.reply(summary, replyMenu);
  await exportLeadToTopic(ctx, p);
  ctx.session.stage = 'done';
}

// ---------- Health ----------
bot.command('health', (ctx) => ctx.reply('OK ✅'));

// ---------- Launch (polling) ----------
bot.launch().then(() => console.log('JonGPTbot (Node + Gemini Free Tier) running...'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
