import 'dotenv/config';
import { Telegraf, Markup, session } from 'telegraf';
import OpenAI from 'openai';

const bot = new Telegraf(process.env.BOT_TOKEN);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
bot.use(session());

// ===== Brand personasi (AI uchun) =====
const SYSTEM_PROMPT = `
Sen Jon Branding agentligining AI-assistentisan.
Ohang: do'stona, tabiiy, qisqa va ta'sirli. Savolni aniqlashtir, keyin qiymat taklif qil.
Maqsad: mijozni ehtiyojiga qarab yo'naltirish: (1) paketlar haqida tushuntirish,
(2) konsultatsiya bron qilish, (3) buyurtma ma'lumotlarini yig'ish, (4) kerak bo'lsa jonli operatorga ulash.
Har bir javobda ortiqcha so'z ko'paytirma.
Kvalifikatsiya: biznes nomi, soha, muddat, budjet, kontakt.
Airtable/CRMga yozish uchun "create_lead" tool chaqir.
`;

// ===== UI helpers =====
const mainMenu = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback('📦 Paketlar', 'paketlar')],
    [Markup.button.callback('📝 Buyurtma (AI)', 'ai_buyurtma')],
    [
      Markup.button.callback('📞 Konsultatsiya', 'konsult'),
      Markup.button.callback('🎯 Portfolio', 'portfolio')
    ],
    [Markup.button.callback('☎️ Aloqa', 'aloqa')]
  ]);

// ===== Simple pages =====
bot.start(async (ctx) => {
  await ctx.reply(
    "Assalomu alaykum! Jon Branding’ga xush kelibsiz. Qulay yo'lni tanlang yoki savolingizni yozing:",
    mainMenu()
  );
});
bot.action('paketlar', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
`Asosiy xizmatlar:
1) Logo
2) Logo + Korporativ uslub
3) Logo + KU + Brandbook
Savolingizni yozing yoki '📝 Buyurtma (AI)' tugmasini bosing.`,
    mainMenu()
  );
});
bot.action('konsult', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `15 daqiqalik qo‘ng‘iroq uchun qulay vaqtni yozing (masalan: "Ertaga 11:30"). AI menedjerimiz davom ettiradi.`,
    mainMenu()
  );
});
bot.action('portfolio', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `So‘nggi ishlar: logolar, KU, brandbook.
To‘liq portfolio: jonbranding.uz/portfolio`,
    mainMenu()
  );
});
bot.action('aloqa', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `Telefon: +998 97 335 59 00
Telegram: @baxtiyorjongaziyev
Ish vaqti: Du–Shan 10:00–19:00`,
    mainMenu()
  );
});
bot.action('ai_buyurtma', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply("Buyurtma uchun qisqa yozing: biznes nomi, paket, muddat, budjet, kontakt. Yordam beraman.");
});

// ====== AI Router ======
// Tool: CRMga yozish (hozircha chatga chiqaramiz; keyingi qadamda Airtable/Webhook)
async function createLead(ctx, payload) {
  const d = payload || {};
  const summary =
`Yangi lead:
• Nomi: ${d.name || '-'}
• Paket: ${d.pack || '-'}
• Muddat: ${d.due || '-'}
• Budjet: ${d.budget || '-'}
• Kontakt: ${d.contact || '-'}
• Qo'shimcha: ${d.note || '-'}`;
  await ctx.reply('Rahmat! Ma’lumotlar qabul qilindi. Menejer tez orada bog‘lanadi.');
  await ctx.reply(summary);
}

// AIga yuborish (kontekst saqlanadi)
async function aiReply(ctx, userText) {
  ctx.session.thread = ctx.session.thread || [];
  ctx.session.thread.push({ role: 'user', content: userText });

  // Tool ko'rsatmalarini systemga qo'shamiz
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...ctx.session.thread
  ];

  // Sodda: faqat chat javobi (tool emulyatsiya qilamiz)
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini", // arzon/tez model — xohlasangiz o'zgartirasiz
    messages,
    temperature: 0.4,
  });

  const text = res.choices?.[0]?.message?.content?.trim() || "Tushunmadim, savolingizni biroz boshqacharoq yozing.";
  ctx.session.thread.push({ role: 'assistant', content: text });

  // Lead triggerini oddiy regex bilan aniqlaymiz (keyingi bosqichda tool callingga o'tamiz)
  const wantLead = /(buyurtma|bron|narx|paket|logo)/i.test(userText);
  if (wantLead) {
    // Minimal ekstraktsiya
    const name = userText.match(/(nomi|kompaniya|brand)\s*[:\-]?\s*([^\n,]+)/i)?.[2];
    const contact = userText.match(/@[\w_]+|\+?\d[\d\s\-]{7,}/)?.[0];
    await createLead(ctx, { name, contact, note: userText });
  }

  await ctx.reply(text);
}

// Matnlar uchun AI yoqamiz (form bo'lmasa)
bot.on('text', async (ctx) => {
  // Agar eski form ishlayotgan bo'lsa — avval uni to'xtatamiz:
  if (ctx.session.form) { ctx.session.form = null; }
  try {
    await aiReply(ctx, ctx.message.text);
  } catch (e) {
    console.error(e);
    await ctx.reply("Serverda kichik nosozlik. Bir daqiqadan so‘ng qayta urinib ko‘ring.");
  }
});

bot.launch();
console.log('JonGPTbot (AI) running...');
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
