// JonGPT Business Assistant — Telegraf + Bots for Business + Lead funnel
// - Business DM uchun business_connection_id qo'shiladi
// - Qisqa, odamona savol-javoblar
// - Mijozdan: xizmat, muddat, taxminiy budjet va kontakt olinadi
// - "Kontaktimni yuborish" tugmasi bor
// - (ixtiyoriy) leadni Team guruhingizdagi CRM topicga yuboradi

import 'dotenv/config';
import { Telegraf, Markup, session } from 'telegraf';

// ==== ENV ====
const BOT_TOKEN        = process.env.BOT_TOKEN;            // Telegram bot token
const LEADS_CHAT_ID    = process.env.LEADS_CHAT_ID || '';  // -100.... (ixtiyoriy)
const LEADS_TOPIC_ID   = Number(process.env.LEADS_TOPIC_ID || 0); // topic id (ixtiyoriy)

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN topilmadi. Railway Variables ga qo‘ying.');
  process.exit(1);
}

// ==== Bot ====
const bot = new Telegraf(BOT_TOKEN);

// Business DM: har bir sendMessage ga business_connection_id qo'shish helperi
function bcExtra(ctx) {
  const id =
    ctx.message?.business_connection_id ||
    ctx.callbackQuery?.message?.business_connection_id ||
    ctx.update?.business_connection?.id;
  return id ? { business_connection_id: id } : {};
}
async function send(ctx, text, extra = {}) {
  const chatId = ctx.chat?.id ?? ctx.from?.id;
  return ctx.telegram.sendMessage(chatId, text, { ...extra, ...bcExtra(ctx) });
}

// ==== UI ====
const mainKB = Markup.keyboard([
  ['📦 Xizmatlar', '🗒️ Buyurtma (AI)'],
  ['💬 Konsultatsiya', '📷 Portfolio'],
  ['☎️ Aloqa']
]).resize();

const contactKB = Markup.keyboard([
  [Markup.button.contactRequest('📱 Kontaktimni yuborish')],
  ['↩️ Ortga', '❌ Bekor qilish']
]).resize();

const timeKB = Markup.inlineKeyboard([
  [Markup.button.callback('📞 Bugun', 'due_today'), Markup.button.callback('📅 Ertaga', 'due_tomorrow')],
  [Markup.button.callback('🗓 Shu hafta', 'due_week')]
]);

const budgetKB = Markup.inlineKeyboard([
  [Markup.button.callback('📌 Minimal', 'b_min')],
  [Markup.button.callback('📌 O‘rtacha', 'b_mid')],
  [Markup.button.callback('📌 Kengaytirilgan', 'b_max')]
]);

const servicesText =
`Qaysi xizmat kerak?
0) Naming — brend nomi
1) Logo — logotip
2) Korporativ uslub — rang/shrift/qoidalar
3) Brandbook — to‘liq qo‘llanma

Qisqacha yozing: masalan "Logo" yoki "Logo + uslub".`;

// ==== Session (in-memory) ====
bot.use(session());
bot.use((ctx, next) => {
  ctx.session ??= {};
  ctx.session.lead ??= { service: null, due: null, budget: null, contact: null };
  ctx.session.stage ??= 'service'; // service -> due -> budget -> contact -> done
  return next();
});

// ==== Statik tugmalar ====
bot.hears('📷 Portfolio', (ctx) =>
  send(ctx, 'To‘liq portfolio: https://t.me/JonBranding', {
    reply_markup: { inline_keyboard: [[{ text: '🔗 Portfolio kanali', url: 'https://t.me/JonBranding' }]] }
  })
);

bot.hears('☎️ Aloqa', (ctx) =>
  send(ctx, 'Telefon: +998 33 645 00 97\nTelegram: @baxtiyorjongaziyev\nIsh vaqti: Du–Shan 10:00–19:00', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📞 Qo‘ng‘iroq qilish', url: 'tel:+998336450097' }],
        [{ text: '✉️ Telegram yozish', url: 'https://t.me/baxtiyorjongaziyev' }]
      ]
    }
  })
);

bot.hears('📦 Xizmatlar', (ctx) => send(ctx, servicesText, mainKB));

bot.hears('💬 Konsultatsiya', (ctx) =>
  send(ctx, 'Qulay vaqtni tanlang yoki “Ertaga 11:30” yozib yuboring.', timeKB)
);

bot.hears('🗒️ Buyurtma (AI)', (ctx) =>
  send(ctx, 'Qisqacha yozing: xizmat (Naming/Logo/Uslub/Brandbook), muddat, taxminiy budjet, kontakt.', mainKB)
);

// ==== Start / Greeting ====
bot.start(async (ctx) => {
  ctx.session.lead = { service: null, due: null, budget: null, contact: null };
  ctx.session.stage = 'service';
  await send(ctx, 'Assalomu alaykum! Men maslahatchiman. Qisqa savollar bilan ehtiyojingizni aniqlayman. ✅', mainKB);
  await askByStage(ctx, true);
});

// ==== Router ====
bot.on('text', async (ctx) => {
  const text = (ctx.message.text || '').trim();

  // STARTDAN keyin tez-tez kerak bo‘ladigan qisqa javoblar:
  if (/^(xizmat|xizmatlar)$/i.test(text)) { await send(ctx, servicesText); return; }
  if (/^portfolio$/i.test(text)) { await send(ctx, 'https://t.me/JonBranding'); return; }
  if (/^aloqa$/i.test(text)) {
    await send(ctx, 'Telefon: +998 33 645 00 97\nTelegram: @baxtiyorjongaziyev', mainKB);
    return;
  }

  // Agar bosqich allaqachon tugagan bo‘lsa — takror savol bermaymiz
  if (ctx.session.stage === 'done') {
    await send(ctx, 'Rahmat! Ma’lumotlar yozildi. Yana savol bo‘lsa yoza olasiz.', mainKB);
    return;
  }

  // Matndan foydali narsalarni olish
  const upd = extractFromText(text);
  Object.assign(ctx.session.lead, mergeNew(ctx.session.lead, upd));
  ctx.session.stage = nextStage(ctx.session.lead);

  if (ctx.session.stage !== 'done') {
    await askByStage(ctx, true);
  } else {
    await finalizeLead(ctx);
  }
});

// ==== Callbacks (muddat/budjet) ====
bot.on('callback_query', async (ctx) => {
  const d = ctx.callbackQuery?.data || '';
  if (!d) return ctx.answerCbQuery();

  if (d.startsWith('due_')) {
    const map = { due_today: 'bugun', due_tomorrow: 'ertaga', due_week: 'shu hafta' };
    ctx.session.lead.due ??= map[d] || null;
    await ctx.answerCbQuery('Tanlandi: ' + ctx.session.lead.due);
    if (!ctx.session.lead.budget) {
      await send(ctx, 'Taxminiy budjet diapazoni qaysi biri?', budgetKB);
      ctx.session.stage = 'budget';
    } else {
      ctx.session.stage = nextStage(ctx.session.lead);
      await askByStage(ctx, true);
    }
    return;
  }

  if (d.startsWith('b_')) {
    const map = { b_min: 'minimal', b_mid: 'o‘rtacha', b_max: 'kengaytirilgan' };
    ctx.session.lead.budget ??= map[d] || null;
    await ctx.answerCbQuery('Tanlandi: ' + ctx.session.lead.budget);
    ctx.session.stage = nextStage(ctx.session.lead);
    await askByStage(ctx, true);
    return;
  }

  await ctx.answerCbQuery();
});

// ==== Kontakt tugmasi ====
bot.on('contact', async (ctx) => {
  const phone = ctx.message?.contact?.phone_number;
  if (phone) {
    ctx.session.lead.contact = phone.startsWith('+') ? phone : ('+' + phone.replace(/\D/g, ''));
    await send(ctx, `✔️ Kontakt oldim: ${ctx.session.lead.contact}`, mainKB);
  } else {
    await send(ctx, 'Kontaktni ola olmadim. Tugmani qayta bosing yoki raqamni yozing.', contactKB);
  }
  ctx.session.stage = nextStage(ctx.session.lead);
  if (ctx.session.stage === 'done') await finalizeLead(ctx);
  else await askByStage(ctx, true);
});

// ==== /id — tashxis ====
bot.command('id', async (ctx) => {
  const chatId = ctx.chat?.id;
  const threadId = ctx.message?.message_thread_id;
  await send(ctx, `Chat ID: ${chatId}\nTopic ID: ${threadId ?? '(topicda yuboring)'}`);
});

// ==== Helperlar ====
function extractFromText(text) {
  const t = text.toLowerCase();

  // xizmat
  let service = null;
  if (/naming/.test(t)) service = 'Naming';
  else if (/brandbook|brand book/.test(t)) service = 'Brandbook';
  else if (/(korporativ|uslub|ku)/.test(t)) service = 'Korporativ uslub';
  else if (/logo/.test(t)) service = 'Logo';

  // muddat
  let due = null;
  if (/bugun/.test(t)) due = 'bugun';
  else if (/ertaga/.test(t)) due = 'ertaga';
  else if (/hafta/.test(t)) due = 'shu hafta';
  else {
    const m = t.match(/(\d{1,2}:\d{2})|(\d{1,2}\s*(kun|hafta|oy))/);
    if (m) due = m[0];
  }

  // budjet — oddiy so‘zlar
  let budget = null;
  if (/minimal|arzon/.test(t)) budget = 'minimal';
  else if (/o'?rtacha/.test(t)) budget = 'o‘rtacha';
  else if (/kengaytirilgan|qimmat/.test(t)) budget = 'kengaytirilgan';

  // kontakt — @username yoki telefon
  let contact = text.match(/@[\w_]+|\+?\d[\d\s\-()]{7,}/)?.[0] || null;

  return { service, due, budget, contact };
}
function mergeNew(dst, src) {
  // faqat bo‘sh joylarga yozamiz
  return {
    service: dst.service || src.service || null,
    due:     dst.due     || src.due     || null,
    budget:  dst.budget  || src.budget  || null,
    contact: dst.contact || src.contact || null
  };
}
function nextStage(l) {
  if (!l.service) return 'service';
  if (!l.due)     return 'due';
  if (!l.budget)  return 'budget';
  if (!l.contact) return 'contact';
  return 'done';
}
async function askByStage(ctx, force = false) {
  const s = ctx.session.stage;
  if (s === 'service') {
    await send(ctx, servicesText, mainKB);
  } else if (s === 'due') {
    await send(ctx, 'Qachon kerak? “Bugun”, “Ertaga” yoki “Shu hafta” — tugmalardan birini tanlang, yoki o‘zingiz yozing.', timeKB);
  } else if (s === 'budget') {
    await send(ctx, 'Taxminiy budjet diapazoni? (Minimal / O‘rtacha / Kengaytirilgan)', budgetKB);
  } else if (s === 'contact') {
    await send(ctx, 'Bog‘lanish uchun “📱 Kontaktimni yuborish” tugmasini bosing 👇', contactKB);
  }
}

function leadSummary(l, ctx) {
  const who = `${ctx.from?.first_name || ''} ${ctx.from?.last_name || ''}`.trim() || '@' + (ctx.from?.username || '');
  return (
`🆕 Yangi lead
👤 Mijoz: ${who} (@${ctx.from?.username || '-'})
📞 Kontakt: ${l.contact || '-'}
🧩 Xizmat: ${l.service || '-'}
⏰ Muddat: ${l.due || '-'}
💰 Budjet: ${l.budget || '-'}
🕒 ${new Date().toLocaleString('uz-UZ')}`
  );
}

async function finalizeLead(ctx) {
  const l = ctx.session.lead;
  await send(ctx,
`✔️ Yozib oldim:
• Xizmat: ${l.service}
• Muddat: ${l.due}
• Budjet: ${l.budget}
• Kontakt: ${l.contact}

Rahmat! Menejer tez orada bog‘lanadi. Yana savol bo‘lsa bemalol yozing.`, mainKB);

  // (ixtiyoriy) Team guruhidagi CRM topicga yuborish
  if (LEADS_CHAT_ID && LEADS_TOPIC_ID) {
    try {
      await ctx.telegram.sendMessage(
        LEADS_CHAT_ID,
        leadSummary(l, ctx),
        { message_thread_id: LEADS_TOPIC_ID }
      );
    } catch (e) { console.error('TG topic lead error:', e?.message); }
  }

  ctx.session.stage = 'done';
}

// ==== Error guard ====
bot.catch((err, ctx) => {
  console.error('Bot error', ctx.update?.update_id, err);
  try { send(ctx, 'Serverda kichik nosozlik. Birozdan so‘ng qayta urinib ko‘ring.'); } catch {}
});

// ==== Run ====
bot.launch().then(() => console.log('JonGPT Business Assistant running…'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
