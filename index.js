import { Telegraf, session } from 'telegraf';
import OpenAI from 'openai';

const bot = new Telegraf(process.env.BOT_TOKEN);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// === Sessiya doim mavjud bo‘lsin ===
bot.use(session());
bot.use((ctx, next) => {
  ctx.session ??= {};
  return next();
});

// === Xatolarni global tutish ===
bot.catch((err, ctx) => {
  console.error('Bot error for', ctx.update?.update_id, err);
});

// === Start komandasi ===
bot.start((ctx) => {
  ctx.reply(
    "Assalomu alaykum! Jon Branding’ga xush kelibsiz. Qulay yo'lni tanlang yoki savolingizni yozing:",
    {
      reply_markup: {
        keyboard: [
          ["📦 Paketlar", "🗒️ Buyurtma (AI)"],
          ["📞 Konsultatsiya", "📷 Portfolio"],
          ["☎️ Aloqa"]
        ],
        resize_keyboard: true
      }
    }
  );
});

// === AI javob funksiyasi ===
async function aiReply(ctx, text) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "Siz Jon Branding AI sotuv menejerisiz. Mijozlar bilan samimiy va professional gaplashing, paketlar haqida tushuntiring, va kerak bo‘lsa savollar bering." },
      { role: "user", content: text }
    ]
  });

  const aiText = completion.choices[0].message.content;
  await ctx.reply(aiText);
}

// === Matnli xabarlar handleri ===
bot.on('text', async (ctx) => {
  if (ctx.session?.form) ctx.session.form = null;

  try {
    await aiReply(ctx, ctx.message.text);
  } catch (e) {
    console.error(e);
    await ctx.reply("Serverda kichik nosozlik. Bir daqiqadan so‘ng qayta urinib ko‘ring.");
  }
});

// === Botni ishga tushirish ===
bot.launch().then(() => {
  console.log("JonGPTbot (AI) running...");
});

// Graceful stop (Railway uchun)
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
