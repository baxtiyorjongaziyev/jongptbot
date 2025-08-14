import requests
from flask import Flask, request

# === Config ===
TELEGRAM_TOKEN = "7738413085:AAE_CYNnbpyoW5KiheUTJOPBmz_jHLVWgWc"
CRM_CHAT_ID = "-1002566480563"  # Jon Branding Team
CRM_TOPIC_ID = 52               # CRM topic ID
GEMINI_API_KEY = "AIzaSyCCEjoylaZekaQXH0We7DU0u3W66igQEZQ"

app = Flask(__name__)

# === Gemini API bilan ishlash ===
def ask_gemini(user_text):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key={GEMINI_API_KEY}"
    headers = {"Content-Type": "application/json"}
    data = {
        "contents": [
            {"parts": [{"text": f"Lead ma'lumotlarini olish uchun foydalanuvchiga javob yoz: {user_text}"}]}
        ]
    }
    r = requests.post(url, headers=headers, json=data)
    return r.json()["candidates"][0]["content"]["parts"][0]["text"]

# === CRM guruhiga lead yuborish ===
def send_to_crm(lead_text):
    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
    payload = {
        "chat_id": CRM_CHAT_ID,
        "text": lead_text,
        "message_thread_id": CRM_TOPIC_ID
    }
    requests.post(url, json=payload)

# === Telegram webhook ===
@app.route(f"/{TELEGRAM_TOKEN}", methods=["POST"])
def webhook():
    data = request.get_json()
    if "message" in data:
        chat_id = data["message"]["chat"]["id"]
        user_text = data["message"].get("text", "")

        # AI javobi
        ai_reply = ask_gemini(user_text)

        # Foydalanuvchiga yuborish
        requests.post(f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage", json={
            "chat_id": chat_id,
            "text": ai_reply
        })

        # Agar telefon yoki ism bo'lsa, CRM ga saqlash
        if any(k in user_text.lower() for k in ["+998", "tel", "telefon"]):
            name = data["message"]["from"]["first_name"]
            send_to_crm(f"🆕 Lead: {name} - {user_text}")

    return {"ok": True}

if __name__ == "__main__":
    app.run(port=5000)
