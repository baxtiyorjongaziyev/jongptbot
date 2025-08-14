// Jon.Branding AI Bot — Telegraf + Gemini Free Tier + Persistent Memory + CRM topic
require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
const storage = require('node-persist');

// ====== ENV ======
const BOT_TOKEN      = process.env.BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const LEADS_CHAT_ID  = process.env.LEADS_CHAT_ID;           // ex: -1002566480563
const LEADS_TOPIC_ID = Number(process.env.LEADS_TOPIC_ID);  // ex: 52

if (!BOT_TOKEN) { console.error('❌ BOT_TOKEN yo‘q'); process.exit(1); }
if (!GEMINI_API_KEY) console.warn('⚠️ GEMINI_API_KEY yo‘q — AI javoblari cheklanadi');

// ====== BOT ======
const bot = new Telegraf(BOT_TOKEN);

// ====== PERSISTENT MEMORY ======
(async () => {
  await storage.init({ dir: 'data_store', stringify: JSON.stringify, parse: JSON.parse });
})();

async function getMem(userId) {
  const key = `u:${userId}`;
  return (await storage.getItem(key)) || {
    pack: null,
    due: null,
    intent: null,       // e.g. “naming”, “logo”, ...
    industry: null,
    pains: [],          // og‘riq-nuqtalar
    goals: [],          // maqsadlar
    contact: null,
    stage: 'pack',
    lastQuestion: null,
    updatedAt: Date.now()
  };
}
async function setMem(userId, patch = {}) {
  const key = `u:${userId}`;
  const cur = await getMem(userId);
  const next = { ...cur, ...patch, updatedAt: Date.now() };
  await storage.setItem(key, next);
  return next;
}

// ====== UI ======
const kbMain = {
  reply_markup: {
    keyboard: [
      ['📦 Xizmatlar', '🗒️ Buyurtma (AI)'],
      ['📞 Konsultatsiya', '📷 Portfolio'],
      ['☎️ Aloqa']
    ],
    resize_keyboard: true
  }
};
const kbContact = Markup.keyboard([
  [Markup.button.contactRequest('📱 Kontaktimni yuborish')],
  ['↩️ Ortga', '❌ Bekor qilish']
]).resize();

const kbDueInline = {
  reply_markup: {
    inline_keyboard: [
      [{ text: '📞 Bugun', callback_data: 'due_today' },
       { text: '📅 Ertaga', callback_data: 'due_tomorrow' }],
      [{ text: '🗓 Sana yozaman', callback_data: 'due_custom' }]
    ]
  }
};

function promptByStage(mem) {
  switch (mem.stage) {
    case 'pack':
      return {
        text:
`Qaysi xizmat hozir kerak?
• Naming (nom tanlash)
• Logo (faqat logotip)
• Korporativ uslub (logo + ko‘rinish)
• Brandbook (to‘liq qo‘llanma)

Qisqacha yozing: masalan “Naming” yoki “Logo + uslub”.`,
        extra: kbMain
      };
    case 'due':     return { text: "Qachongacha rejalashtiryapsiz? Tugmadan tanlang yoki yozing:", extra: kbDueInline };
    case 'intent':  return { text: "Qaysi sohada faoliyat yuritasiz? (masalan: restoran, o‘quv markaz, onlayn do‘kon...)", extra: kbMain };
    case 'pains':   return { text: "Asosiy muammo nimada? (masalan: tanimayapti, ko‘rinish tartibsiz, qimmat sota olmayapman...)", extra: kbMain };
    case 'goals':   return { text: "Qisqacha maqsadingizni yozing (masalan: sotuvni oshirish, premium segmentga chiqish...)", extra: kbMain };
    case 'contact': return { text: "📱 Bog‘lanish uchun kontaktingizni yuborasizmi? (tugma bosib yuborishingiz mumkin)", extra: kbContact };
    default:        return null;
  }
}

function nextStage(mem) {
  if (!mem.pack)     return 'pack';
  if (!mem.due)      return 'due';
  if (!mem.industry) return 'intent';
  if (!mem.pains?.length) return 'pains';
  if (!mem.goals?.length) return 'goals';
  if (!mem.contact)  return 'contact';
  return 'done';
}

// ====== SESSION (light) ======
bot.use(session());
bot.use((ctx, next) => {
  ctx.session ??= { lastPromptKey: '', cooldownAt: 0, pushyOff: false };
  return next();
});
function shouldCooldown(ctx, key) {
  const now = Date.now();
  if (ctx.session.lastPromptKey === key && (now - ctx.session.cooldownAt) < 12000) return true; // 12s
  ctx.session.lastPromptKey = key;
  ctx.session.cooldownAt = now;
  return false;
}

// ====== PARSERS ======
function extractFacts(text) {
  const t = (text || '').toLowerCase();
  const pack =
    /(naming)/i.test(text) ? 'Naming' :
    /(logo\s*\+\s*(uslub|korporativ)|logo\+uslub|logo\+ku)/i.test(text) ? 'Logo + Korporativ uslub' :
    /\blogo\b/i.test(text) ? 'Logo' :
    /(brandbook|brendb(u|o)k)/i.test(text) ? 'Brandbook' : null;

  const due =
    t.includes('bugun')   ? 'bugun'   :
    t.includes('ertaga')  ? 'ertaga'  :
    null;

  const industry =
    /(restoran|kafe|fast ?food|horeca)/i.test(t) ? 'HoReCa' :
    /(ta\'?lim|kurs|o\'quv markaz|education)/i.test(t) ? 'Education' :
    /(onlayn|internet).{0,5}do\'?kon|e-?commerce|marketpleys/i.test(t) ? 'E-commerce' :
    /(go\'?zallik|salon|beauty)/i.test(t) ? 'Beauty' :
    null;

  // pains & goals – oddiy heuristika (kalit so‘z)
  const pains = [];
  if (/tanimayap(ti|di)|ko\'?rinish.*tartibsiz|eskirgan|qimmat.*sota.*olmay|sotuv.*tush/i.test(t)) pains.push(text);
  const goals = [];
  if (/sotuv.*osh|premium|bozor.*kirish|ajralib.*tur/i.test(t)) goals.push(text);

  // contact
  let contact = text.match(/@[\w_]+|\+?\d[\d\s\-()]{7,}/)?.[0] || null;

  return { pack, due, industry, pains, goals, contact };
}

function mergeMem(mem, facts) {
  const merged = { ...mem };
  if (facts.pack) merged.pack = facts.pack;
  if (facts.due) merged.due = facts.due;
  if (facts.industry) merged.industry = facts.industry;
  if (facts.pains?.length) merged.pains = Array.from(new Set([...(mem.pains || []), ...facts.pains]));
  if (facts.goals?.length) merged.goals = Array.from(new Set([...(mem.goals || []), ...facts.goals]));
  if (facts.contact) merged.contact = facts.contact;
  return merged;
}

// ====== AI (Gemini) — narx aytmasin! ======
async function geminiReply(userText, { pushyOff, mem }) {
  if (!GEMINI_API_KEY) return null;
  try {
    const tone = pushyOff ? 'yumshoq, bitta savol yoki bitta maslahat' : 'qisqa, samimiy, bitta savol';
    const persona =
`Sen Jon.Branding’ning maslahatchi-assistentisan.
— TIL: sodda, mijoz tilida. KU/SML kabi qisqartmalarni ishlatma.
— NARX: hech qachon narx aytma. Narx so‘ralsa: “loyiha hajmiga qarab aniqlanadi, bepul konsultatsiyada tez baholab beramiz” deb ayt va kontakt so‘ra.
— MAQSAD: ehtiyojni och, mos yechimdan birini muloyim taklif qil, yumshoq CTA (kontakt).
— Paketlar: Naming / Logo / Korporativ uslub (Logo + ko‘rinish) / Brandbook.
— Xotira: foydalanuvchi avval aytganlarini eslatib, takror so‘rama: ${JSON.stringify({pack: mem.pack, due: mem.due, industry: mem.industry})}
— CHEK: 1–2 jumla, ortiqcha metafora yo‘q.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const body = { contents: [{ parts: [{ text: `${persona}\n\nFoydalanuvchi: ${userText}` }]}]};
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    return j?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  } catch (e) {
    console.error('Gemini error:', e?.message);
    return null;
  }
}

// ====== CRM EXPORT ======
function leadText(mem, ctx) {
  const who = `${ctx.from?.first_name || ''} ${ctx.from?.last_name || ''}`.trim() || ctx.from?.username || ctx.from?.id;
  return (
`🆕 Yangi lead
👤 Mijoz: ${who} (@${ctx.from?.username || '-'})
🧩 Xizmat: ${mem.pack || '-'}
🏷 Soha: ${mem.industry || '-'}
⏰ Muddat: ${mem.due || '-'}
🎯 Maqsad: ${(mem.goals||[]).slice(-1)[0] || '-'}
😣 Muammo: ${(mem.pains||[]).slice(-1)[0] || '-'}
📱 Kontakt: ${mem.contact || '-'}
📨 Manba: Telegram Bot
🕒 ${new Date().toLocaleString('uz-UZ')}`
  );
}
async function exportLeadToTopic(ctx, mem) {
  if (!LEADS_CHAT_ID || !LEADS_TOPIC_ID) return;
  try {
    await ctx.telegram.sendMessage(LEADS_CHAT_ID, leadText(mem, ctx), { message_thread_id: LEADS_TOPIC_ID });
  } catch (e) { console.error('CRM topic error:', e?.message); }
}

// ====== HELPERS ======
async function askStage(ctx, mem, force=false) {
  const key = `ask:${mem.stage}`;
  if (!force && shouldCooldown(ctx, key)) return;
  const q = promptByStage(mem);
  if (q) {
    await ctx.reply(q.text, q.extra);
    await setMem(ctx.from.id, { lastQuestion: q.text });
  }
}
async function finalize(ctx, mem) {
  const summary =
`✔️ Yozib oldim:
• Xizmat: ${mem.pack || '-'}
• Soha: ${mem.industry || '-'}
• Muddat: ${mem.due || '-'}
• Maqsad: ${(mem.goals||[]).slice(-1)[0] || '-'}
• Kontakt: ${mem.contact || '-'}

Rahmat! Menejer tez orada bog‘lanadi.`;
  await ctx.reply(summary, kbMain);
  await exportLeadToTopic(ctx, mem);
  await setMem(ctx.from.id, { stage: 'done' });
}

// ====== FLOWS ======
bot.start(async (ctx) => {
  const mem = await setMem(ctx.from.id, { stage: 'pack' });
  if (mem.pack || mem.contact) {
    await ctx.reply(`Salom! O‘tgan safar ${mem.pack ? `"${mem.pack}"` : 'ma’lumot'} deb yozgandingiz. Davom etamizmi?`, kbMain);
  } else {
    await ctx.reply("Salom! 30 soniyada ehtiyojingizni aniqlaymiz va mos taklif beramiz. Boshladik. ✅", kbMain);
  }
  await askStage(ctx, mem, true);
});

// Static
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
bot.hears('📦 Xizmatlar', async (ctx) => {
  const mem = await getMem(ctx.from.id);
  await askStage(ctx, mem, true);
});
bot.hears('📞 Konsultatsiya', (ctx) => ctx.reply('Qulay vaqtni yozing (masalan: “Ertaga 11:30”).', kbMain));
bot.hears('🗒️ Buyurtma (AI)', (ctx) =>
  ctx.reply('Qisqacha yozing: xizmat (Naming/Logo/Uslub/Brandbook), muddat, soha, maqsad, kontakt.', kbMain)
);

// “narx” so‘ralsa — hech qachon narx aytmaslik
bot.on('text', async (ctx, next) => {
  const t = (ctx.message.text || '').toLowerCase();
  if (/narx|price|\$|so'm|som|sum/i.test(t)) {
    await ctx.reply("Narx loyihaning hajmi va maqsadiga qarab shakllanadi. Bepul qisqa konsultatsiyada 10 daqiqada baholab beraman. 📱 Kontaktingizni yuborasizmi?", kbContact);
    return; // AI chaqirmaymiz
  }
  return next();
});

// Contact — darhol CRMga
bot.on('contact', async (ctx) => {
  const phone = ctx.message?.contact?.phone_number;
  if (phone) {
    const mem = await setMem(ctx.from.id, { contact: phone });
    await ctx.reply(`✔️ Kontakt oldim: ${phone}\nCRMga yuborildi ✅`, kbMain);
    await exportLeadToTopic(ctx, mem);
    const next = nextStage(mem);
    await setMem(ctx.from.id, { stage: next });
    if (next === 'done') return finalize(ctx, mem);
    await askStage(ctx, { ...mem, stage: next }, true);
  } else {
    await ctx.reply('Kontaktni ola olmadim. Tugmani qayta bosing yoki raqamni yozing.');
  }
});

// Callback — due inline tugmalar
bot.on('callback_query', async (ctx) => {
  const d = ctx.callbackQuery?.data || '';
  let mem = await getMem(ctx.from.id);
  if (d.startsWith('due_')) {
    if (d === 'due_today')    mem = await setMem(ctx.from.id, { due: 'bugun' });
    if (d === 'due_tomorrow') mem = await setMem(ctx.from.id, { due: 'ertaga' });
    if (d === 'due_custom')   await ctx.reply('Yaxshi! Sana/vaqtni yozib yuboring (masalan: “Ertaga 11:30”).');
    await ctx.answerCbQuery('Tanlandi');
    const next = nextStage(mem);
    await setMem(ctx.from.id, { stage: next });
    if (next === 'done') return finalize(ctx, mem);
    await askStage(ctx, { ...mem, stage: next }, true);
    return;
  }
  await ctx.answerCbQuery();
});

// Advisor AI + memory
bot.on('text', async (ctx) => {
  const userText = ctx.message.text?.trim() || '';
  let mem = await getMem(ctx.from.id);

  // Extract + merge
  const facts = extractFacts(userText);
  mem = mergeMem(mem, facts);
  const next = nextStage(mem);
  mem = await setMem(ctx.from.id, { ...mem, stage: next });

  // Advisor javobi (narx kiritilmagan branchda)
  const ai = await geminiReply(userText, { pushyOff: ctx.session.pushyOff, mem });
  if (ai && !shouldCooldown(ctx, `ai:${mem.stage}`)) await ctx.reply(ai);

  // Tez tugmalar
  if (facts.pack && !mem.due)     await ctx.reply('Muddatni tanlang 👇', kbDueInline);
  if (!mem.contact)               await ctx.reply('Bog‘lanish uchun “📱 Kontaktimni yuborish” tugmasini bosing 👇', kbContact);

  // Keyingi bosqich savoli
  if (next !== 'done') {
    await askStage(ctx, mem);
    return;
  }
  await finalize(ctx, mem);
});

// Health & debug
bot.command('status', async (ctx) => {
  const m = await getMem(ctx.from.id);
  await ctx.reply(
`Status:
• Xizmat: ${m.pack || '-'}
• Soha: ${m.industry || '-'}
• Muddat: ${m.due || '-'}
• Maqsad: ${(m.goals||[]).slice(-1)[0] || '-'}
• Muammo: ${(m.pains||[]).slice(-1)[0] || '-'}
• Kontakt: ${m.contact || '-'}
• Stage: ${m.stage}`
);
});
bot.command('health', (ctx) => ctx.reply('OK ✅'));

// Launch
bot.launch().then(() => console.log('Jon.Branding AI bot (memory+no-price) running...'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
