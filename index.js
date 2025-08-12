// yuqorida borlari o'sha-o'sha...
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  // agar sizda project ID bo'lsa (proj_...), qo'shib qo'yamiz
  project: process.env.OPENAI_PROJECT || undefined
});

// ...

async function aiAnswer(text) {
  const system =
    "Sen Jon Branding agentligining AI-assistentisan. Ohang: do'stona, qisqa, ta'sirli. " +
    "Maqsad: paketlar/konsultatsiya/buyurtma bo'yicha yo'naltirish. Savollar ber va qisqa CTA bilan yakunla.";

  const tryModels = ['gpt-4o-mini', 'gpt-4o']; // kerak bo'lsa keyin kengaytiramiz

  let lastErr;
  for (const model of tryModels) {
    try {
      const res = await openai.chat.completions.create({
        model,
        temperature: 0.4,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: text }
        ]
      });
      return res.choices?.[0]?.message?.content?.trim() || '';
    } catch (e) {
      lastErr = e;
      // loglarni boyitib qo'yamiz
      console.error('OpenAI error (model:', model, ')',
        'status:', e?.status,
        'message:', e?.message,
        'data:', e?.response?.data);
    }
  }
  throw lastErr;
}

async function aiReply(ctx, text) {
  if (!process.env.OPENAI_API_KEY) {
    await ctx.reply("AI kaliti o‘rnatilmagan. Admin tekshiradi.");
    return;
  }
  try {
    const answer = await aiAnswer(text);
    await ctx.reply(answer || 'Savolingizni biroz aniqroq yozing.', replyMenu);

    // lead triggeri
    if (/(buyurtma|bron|narx|paket|logo)/i.test(text)) {
      const contact = text.match(/@[\w_]+|\+?\d[\d\s\-]{7,}/)?.[0] || '-';
      await ctx.reply(`✔️ Yozib oldim. Kontakt: ${contact}. Menejer tez orada bog‘lanadi.`, replyMenu);
    }
  } catch (e) {
    const code = e?.status;
    let userMsg = "AI serverida nosozlik. Birozdan so‘ng qayta urinib ko‘ring.";
    if (code === 401) userMsg = "AI kaliti noto‘g‘ri yoki project mos emas. Admin tekshiradi.";
    else if (code === 403) userMsg = "Ushbu modelga ruxsat yo‘q. Boshqa modelni tanlash kerak.";
    else if (code === 404) userMsg = "Model topilmadi. Admin model nomini tekshiradi.";
    else if (code === 429) userMsg = "Limit/kvota tugagan. Tez orada yana urinib ko‘ring.";
    await ctx.reply(userMsg, replyMenu);
  }
}
