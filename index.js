import logging
from telegram import (
    Update, 
    ReplyKeyboardMarkup, 
    KeyboardButton
)
from telegram.ext import (
    ApplicationBuilder, 
    CommandHandler, 
    MessageHandler, 
    filters, 
    ContextTypes
)
import requests

# --- CONFIG ---
BOT_TOKEN = "7738413085:AAE_CYNnbpyoW5KiheUTJOPBmz_jHLVWgWc"  # Siz bergan token
GEMINI_API_KEY = "AIzaSyCCEjoylaZekaQXH0We7DU0u3W66igQEZQ"

# --- LOGGING ---
logging.basicConfig(level=logging.INFO)

# --- GEMINI AI FUNKSIYA ---
def gemini_reply(prompt):
    url = "https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent"
    headers = {"Content-Type": "application/json"}
    params = {"key": GEMINI_API_KEY}
    data = {
        "contents": [
            {
                "parts": [{"text": prompt}]
            }
        ]
    }
    r = requests.post(url, headers=headers, params=params, json=data)
    if r.status_code == 200:
        return r.json()["candidates"][0]["content"]["parts"][0]["text"]
    else:
        return "Uzr, hozircha javob bera olmayapman."

# --- START COMMAND ---
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    msg = "Assalomu alaykum! 😊\nQaysi xizmat sizga mos?\n0) Naming\n1) Logo\n2) Korporativ uslub\n3) Brandbook"
    await update.message.reply_text(msg)

# --- TEXT HANDLER ---
async def chat(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_text = update.message.text

    # AI orqali javob
    ai_prompt = f"Sen professional, samimiy va qisqa gapiradigan maslahatchi sotuvchisiz. Mijozdan ehtiyojini aniqlab, bosqichma-bosqich olib borasan, ammo to'g'ridan-to'g'ri tiqishtirmaysan. Mijoz: {user_text}"
    ai_reply = gemini_reply(ai_prompt)

    await update.message.reply_text(ai_reply)

    # Agar foydalanuvchi xizmatni tanlagan bo'lsa, kontakt tugmasini yuborish
    if any(word in user_text.lower() for word in ["naming", "logo", "uslub", "brandbook"]):
        contact_btn = KeyboardButton("📱 Kontaktimni yuborish", request_contact=True)
        kb = ReplyKeyboardMarkup([[contact_btn]], resize_keyboard=True, one_time_keyboard=True)
        await update.message.reply_text("Zo'r! Endi bog'lanish uchun kontakt yuboring 👇", reply_markup=kb)

# --- CONTACT HANDLER ---
async def save_contact(update: Update, context: ContextTypes.DEFAULT_TYPE):
    contact = update.message.contact
    await update.message.reply_text(f"Rahmat! Telefon raqamingiz qabul qilindi: {contact.phone_number}")
    # Bu yerda siz contactni Airtable yoki boshqa joyga saqlash kodingizni qo‘shishingiz mumkin

# --- MAIN ---
app = ApplicationBuilder().token(BOT_TOKEN).build()
app.add_handler(CommandHandler("start", start))
app.add_handler(MessageHandler(filters.CONTACT, save_contact))
app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, chat))

if __name__ == "__main__":
    app.run_polling()
