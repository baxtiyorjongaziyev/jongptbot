// JonGPT — qisqa maslahatchi bot: xizmat -> muddat -> kontakt -> tasdiq (+ CRM topic yuborish)
// Business DM (Bots for Business) qo'llab-quvvatlanadi.
import 'dotenv/config';
import { Telegraf, Markup, session } from 'telegraf';

// === ENV / CONFIG ===
const BOT_TOKEN       = process.env.BOT_TOKEN; // Bot token (env)
const WEBSITE_URL     = process.env.WEBSITE_URL   || 'https://jonbranding.uz';
const PORTFOLIO_URL   = process.env.PORTFOLIO_URL || 'https://t.me/JonBranding';
const OWNER_TG        = process.env.OWNER_TG      || '@baxtiyorjongaziyev';

// --- CRM: env bo'lmasa ham, siz bergan default ID'lar ishlaydi ---
const LEADS_CHAT_ID   = Number(process.env.LEADS_CHAT_ID  || -1002566480563); // Jon Branding Team
const LEADS_TOPIC_ID  = Number(process.env.LEADS_TOPIC_ID || 52);             // CRM topic

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN yo‘q. Railway -> Variables’dan kiriting.');
  process.exit(1);
}

// === BOT ===
const bot = new Telegraf(BOT_TOKEN);

// Business messages uchun qo‘shimcha
function bcExtra(ctx) {
  const id =
    ctx.update?.business_connection?.id ||
    ctx.message?.business_connection_id ||
    ctx.callbackQuery?.message?.business_connection_id;
  return id ? { business_connection_id: id } : {};
}

// Qulay helper
async function send(ctx, text, extra = {}) {
  const chatId = ctx.chat?.id ?? ctx.from?.id;
  return ctx.telegram.sendMessage(chatId, text, { ...extra, ...bcExtra(ctx) });
}

// === UI ===
const mainKb = Markup.keyboard([
  ['📦 Paketlar', '🗒️ Buyurtma (AI)'],
  ['📞 Konsultatsiya', '📷 Portfolio'],
  ['☎️ Aloqa', '⬅️ Menyu']
]).resize();

const consultIK = Markup.inlineKeyboard([
  [ Markup.button.callback('📞 Bugun', 'due_today'),
    Markup.button.callback('📅 Ertaga', 'due_tomorrow') ],
  [ Markup.button.callback('🗓 Shu hafta', 'due_week') ]
]);

const contactKb = Markup.keyboard([
  [ Markup.button.contactRequest('📱 Kontaktimni yuborish') ],
  ['↩️ Ortga', '❌ Bekor qilish']
]).resize();

const serviceIK = Markup.inlineKeyboard([
  [ Markup.button.callback('0) Naming', 'srv_naming') ],
  [ Markup.button.callback('1) Logo', 'srv_logo') ],
  [ Markup.button.callback('2) Korporativ uslub', 'srv_ku') ],
  [ Markup.button.callback('3) Brandbook', 'srv_brandbook') ]
]);

// === Session (state) ===
bot.use(session());
bot.use((ctx, next) => {
  ctx.session ??= {};
  ctx.session.data ??= {
    service: null,   // 'Naming' | 'Logo' | 'Korporativ uslub' | 'Brandbook'
    due:    null,    // 'bugun' | 'ertaga' | 'shu hafta' | custom
    contact:null     // phone/@username
  };
  ctx.session.stage ??= 'service';   // 'service' -> 'due' -> 'contact' -> 'done'
  return next();
});

// === Statik tugmalar ===
bot.hears(['⬅️ Menyu', '/menu'], (ctx) =>
  send(ctx, 'Menyu', mainKb)
);

bot.hears('📷 Portfolio', (ctx) => send(
  ctx,
  `To‘liq portfolio: ${PORTFOLIO_URL}`,
  Markup.inlineKeyboard([[Markup.button.url('🔗 Portfolio kanali', PORTFOLIO_URL)]])
));

bot.hears('☎️ Aloqa', (ctx) => send(
  ctx,
  `Telefon: +998 33 645 00 97\nTelegram: ${OWNER_TG}\nIsh vaqti: Du–Shan 10:00–19:00`,
  Markup.inlineKeyboard([
    [Markup.button.url('📞 Qo‘ng‘iroq qilish', 'tel:+998336450097')],
    [Markup.button.url('✉️ Telegram yozish', `https://t.me/${OWNER_TG.replace('@','')}`)]
  ])
));

bot.hears('📞 Konsultatsiya', (ctx) =>
  send(ctx, 'Qulay vaqtni tanlang yoki yozing (masalan: “Ertaga 11:30”).', consultIK)
);

bot.hears('📦 Paketlar', (ctx) =>
  send(ctx,
`Qaysi xizmat kerak?
0) Naming — brend nomi
1) Logo — logotip
2) Korporativ uslub — rang/shrift/qoidalar
3) Brandbook — to‘liq qo‘llanma

Qisqacha yozing yoki tugmani bosing.`,
    { reply_markup: serviceIK.reply_markup }
  )
);

// “AI” tugmasi — hozir foydalanuvchini qisqacha yozishga undaydi
bot.hears('🗒️ Buyurtma (AI)', (ctx) =>
  send(ctx, 'Qisqacha yozing: xizmat (Naming/Logo/Korporativ uslub/Brandbook), muddat (“bugun/ertaga/hafta”), kontakt (@username yoki telefon).', mainKb)
);

// === /start ===
bot.start(async (ctx) => {
  ctx.session = {
    data: { service: null, due: null, contact: null },
    stage: 'service'
  };
  await send(ctx, 'Assalomu alaykum! Men maslahatchiman. Qisqa savollar bilan ehtiyojingizni aniqlayman. ✅', mainKb);
  await askStage(ctx, true);
});

// === Bosqich savollari ===
async function askStage(ctx, force=false) {
  const st = ctx.session.stage;
  if (st === 'service') {
    return send(ctx, 'Qaysi xizmat kerak? Tugmalardan birini bosing yoki yozing.', { reply_markup: serviceIK.reply_markup });
  }
  if (st === 'due') {
    return send(ctx, 'Qachon kerak? “Bugun”, “Ertaga” yoki “Shu hafta”.', consultIK);
  }
  if (st === 'contact') {
    return send(ctx, 'Bog‘lanish uchun “📱 Kontaktimni yuborish” tugmasini bosing yoki raqam/@username yozing.', contactKb);
  }
  if (st === 'done' && force) {
    return finalize(ctx);
  }
}

// === Callbacklar (inline tugmalar) ===
bot.on('callback_query', async (ctx) => {
  const d = ctx.callbackQuery?.data || '';
  if (!d) return ctx.answerCbQuery();

  // xizmat tanlandi
  if (d.startsWith('srv_')) {
    const map = {
      srv_naming: 'Naming',
      srv_logo: 'Logo',
      srv_ku: 'Korporativ uslub',
      srv_brandbook: 'Brandbook'
    };
    ctx.session.data.service = map[d];
    ctx.session.stage = ctx.session.data.due ? (ctx.session.data.contact ? 'done' : 'contact') : 'due';
    await ctx.answerCbQuery(`Tanlandi: ${ctx.session.data.service}`);
    return askStage(ctx, true);
  }

  // muddat tanlandi
  if (d.startsWith('due_')) {
    const val = d === 'due_today' ? 'bugun' : d === 'due_tomorrow' ? 'ertaga' : 'shu hafta';
    ctx.session.data.due = val;
    ctx.session.stage = ctx.session.data.contact ? 'done' : 'contact';
    await ctx.answerCbQuery(`Tanlandi: ${val}`);
    return askStage(ctx, true);
  }

  await ctx.answerCbQuery();
});

// === Kontakt tugmasi (share contact) ===
bot.on('contact', async (ctx) => {
  const phone = ctx.message?.contact?.phone_number;
  if (phone) {
    ctx.session.data.contact = phone;
    await send(ctx, `✔️ Kontakt oldim: ${phone}`, mainKb);
    ctx.session.stage = 'done';
    return finalize(ctx);
  }
});

// === Matn routeri ===
bot.on('text', async (ctx) => {
  const t = (ctx.message.text || '').trim();

  if (/^menyu$/i.test(t)) return send(ctx, 'Menyu', mainKb);

  if (ctx.session.stage === 'service') {
    const s = detectService(t);
    if (s) {
      ctx.session.data.service = s;
      ctx.session.stage = 'due';
      return askStage(ctx, true);
    }
    return askStage(ctx, true);
  }

  if (ctx.session.stage === 'due') {
    const d = detectDue(t);
    if (d) {
      ctx.session.data.due = d;
      ctx.session.stage = 'contact';
      return askStage(ctx, true);
    }
    return askStage(ctx);
  }

  if (ctx.session.stage === 'contact') {
    const c = detectContact(t);
    if (c) {
      ctx.session.data.contact = c;
      ctx.session.stage = 'done';
      return finalize(ctx);
    }
    return askStage(ctx);
  }

  if (ctx.session.stage === 'done') {
    return send(ctx, 'Rahmat! Buyurtma qabul qilindi. Yana savol bo‘lsa yozing yoki “📞 Konsultatsiya” ni bosing.', mainKb);
  }
});

// === Yakunlash + CRM topic ga yuborish ===
async function finalize(ctx) {
  const p = ctx.session.data;
  const txt =
`✔️ Yozib oldim:
• Xizmat: ${p.service}
• Muddat: ${p.due}
• Kontakt: ${p.contact}

Rahmat! Menejer tez orada bog‘lanadi. Portfolio yoki saytni ko‘rib chiqasizmi?`;

  await send(ctx, txt, Markup.inlineKeyboard([
    [ Markup.button.url('🌐 Web-sayt', WEBSITE_URL) ],
    [ Markup.button.url('📷 Portfolio', PORTFOLIO_URL) ]
  ]));

  // ---- CRM topic'ga ham yuboramiz (siz bergan ID'lar bilan) ----
  try {
    const who = `${ctx.from?.first_name || ''} ${ctx.from?.last_name || ''}`.trim()
              || `@${ctx.from?.username || '-'}`;
    const crm =
`🆕 Lead
👤 ${who} (@${ctx.from?.username || '-'}) | id: ${ctx.from?.id}
🧩 Xizmat: ${p.service || '-'}
⏰ Muddat: ${p.due || '-'}
📱 Kontakt: ${p.contact || '-'}
🕒 ${new Date().toLocaleString('uz-UZ')}`;

    await ctx.telegram.sendMessage(
      LEADS_CHAT_ID,
      crm,
      { message_thread_id: LEADS_TOPIC_ID }
    );
  } catch (e) {
    console.error('CRM topic xabari xatosi:', e?.message);
  }
}

// === Detektorlar ===
function detectService(text = '') {
  const t = text.toLowerCase();
  if (/\bnaming\b|nom/i.test(t)) return 'Naming';
  if (/\blogo\b/.test(t)) return 'Logo';
  if (/uslub|ku|korporativ/i.test(t)) return 'Korporativ uslub';
  if (/brandbook|brand ?book|qo.llanma/i.test(t)) return 'Brandbook';
  return null;
}
function detectDue(text = '') {
  const t = text.toLowerCase();
  if (/bugun/.test(t)) return 'bugun';
  if (/ertaga/.test(t)) return 'ertaga';
  if (/hafta|shu hafta/.test(t)) return 'shu hafta';
  if (/\d{1,2}[:.]\d{2}/.test(t)) return 'shu hafta'; // Erkin vaqt — umumlashtiramiz
  return null;
}
function detectContact(text = '') {
  const at = text.match(/@[\w_]{3,}/)?.[0];
  if (at) return at;
  const phone = text.match(/\+?\d[\d\s\-()]{7,}/)?.[0];
  if (phone) return phone.replace(/\s+/g, '');
  return null;
}

// === Xatoliklar ===
bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  try { send(ctx, 'Serverda kichik nosozlik. Bir ozdan keyin qayta urinib ko‘ring.', mainKb); } catch {}
});

// === RUN ===
bot.launch().then(() => console.log('JonGPT — maslahat/lead bot (CRM topic bilan) ishga tushdi.'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
