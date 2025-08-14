// index.js
import 'dotenv/config';
import { Telegraf, Markup, session } from 'telegraf';
import { GoogleGenerativeAI } from '@google/generative-ai';

const bot = new Telegraf(process.env.BOT_TOKEN);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- Business DM: reply extra ----
function bcExtra(ctx) {
  const id =
    ctx.message?.business_connection_id ||
    ctx.callbackQuery?.message?.business_connection_id ||
    ctx.update?.business_connection?.id;
  return id ? { business_connection_id: id } : {};
}
async function say(ctx, text, extra = {}) {
  return ctx.telegram.sendMessage(ctx.chat.id, text, { ...extra, ...bcExtra(ctx) });
}

// --- session/state ---
bot.use(session());

// --- simple AI helper ---
async function ai(text) {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt =
      "Siz Jon.Branding uchun qisqa, samimiy maslahatchisiz. " +
      "Savolga 1-2 jumlada javob bering va foydalanuvchini keyingi qadamga (xizmat tanlash yoki kontakt berish) muloyim yo'naltiring.\n\n" +
      "Foydalanuvchi: " + text;
    const res = await model.generateContent(prompt);
    const out = res?.response?.text?.();
    return (out || '').trim();
  } catch {
    return '';
  }
}

// --- UI ---
const mainKB = Markup.keyboard([
  ['📦 Paketlar', '🗒️ Buyurtma (AI)'],
  ['📞 Konsultatsiya', '📷 Portfolio'],
  [Markup.button.contactRequest('📱 Kontaktimni yuborish')]
]).resize();

bot.start(async (ctx) => {
  ctx.session = { stage: 'idle' };
  await say(ctx, 'Assalomu alaykum! Men maslahatchiman. Qisqa savollar bilan ehtiyojingizni aniqlayman. ✅', mainKB);
  await say(ctx,
    'Qaysi xizmat kerak?\n' +
    '0) Naming — brend nomi\n' +
    '1) Logo — logotip\n' +
    '2) Korporativ uslub — rang/shrift/qoidalar\n' +
    '3) Brandbook — to‘liq qo‘llanma\n\n' +
    'Qisqacha yozing: masalan "Logo" yoki "Logo + uslub".'
  );
});

bot.hears('📷 Portfolio', (ctx) => say(ctx, 'To‘liq portfolio: https://t.me/JonBranding',
  { reply_markup: { inline_keyboard: [[{ text: '🔗 Portfolio kanali', url: 'https://t.me/JonBranding' }]] } }
));

bot.hears('📞 Konsultatsiya', (ctx) =>
  say(ctx, 'Qulay vaqtni yozing (masalan: "Ertaga 11:30").')
);

bot.hears('📦 Paketlar', (ctx) =>
  say(ctx,
    'Qaysi xizmat kerak?\n' +
    '0) Naming — brend nomi\n' +
    '1) Logo — logotip\n' +
    '2) Korporativ uslub — rang/shrift/qoidalar\n' +
    '3) Brandbook — to‘liq qo‘llanma\n\n' +
    'Qisqacha yozing: masalan "Logo" yoki "Logo + uslub".'
  )
);

bot.hears('🗒️ Buyurtma (AI)', (ctx) =>
  say(ctx, 'Qisqacha yozing: xizmat (Naming/Logo/KU/Brandbook), muddat, kontakt.')
);

// Kontakt tugmasi
bot.on('contact', async (ctx) => {
  const phone = ctx.message?.contact?.phone_number;
  await say(ctx, phone ? `✔️ Kontakt oldim: ${phone}` : 'Kontaktni ola olmadim. Qayta urinib ko‘ring.', mainKB);
});

// AI + default handler
bot.on('text', async (ctx) => {
  const t = (ctx.message.text || '').trim();

  // sodda extractorlar
  const contact = t.match(/@[\w_]+|\+?\d[\d\s\-()]{7,}/)?.[0];
  if (contact) await say(ctx, `Kontakt qabul qilindi: ${contact}`);

  // AI qisqa maslahat
  const out = await ai(t);
  if (out) await say(ctx, out, mainKB);
});

bot.command('health', (ctx) => say(ctx, 'OK ✅'));

bot.launch().then(() => console.log('Business DM + Gemini bot running'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
