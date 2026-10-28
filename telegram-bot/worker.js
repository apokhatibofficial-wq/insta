// Telegram bot for the store: answers price / address / how-to-order, and relays
// everything else (photos, questions) to the manager, whose replies go back to the
// customer. Stateless: the customer's chat id travels in the relayed message (#u<id>).
//
// Secrets: TELEGRAM_BOT_TOKEN, MANAGER_CHAT_ID (optional until the manager sends /id).
// Store texts live in store.json.

import store from "./store.json";
import { webhookSecret } from "./secret.js";

const BUTTONS = {
  price: "💰 الأسعار",
  address: "📍 العنوان",
  order: "🛍️ طريقة الطلب",
  contact: "💬 تواصل معنا",
};

const KEYWORDS = {
  price: ["سعر", "اسعار", "بكم", "قديش", "شقد", "كم حق", "price"],
  address: ["عنوان", "وين", "موقع", "مكانكم", "location", "address"],
  order: ["طلب", "اطلب", "توصيل", "شحن", "order"],
};

const KEYBOARD = {
  keyboard: [[{ text: BUTTONS.price }, { text: BUTTONS.address }], [{ text: BUTTONS.order }, { text: BUTTONS.contact }]],
  resize_keyboard: true,
  is_persistent: true,
};

// Arabic spelling variants (hamza forms, taa marbuta, alef maqsura, diacritics) all match.
function normalize(s) {
  return s
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");
}

function topicOf(text) {
  for (const [topic, label] of Object.entries(BUTTONS)) if (text.trim() === label) return topic;
  const t = normalize(text);
  for (const [topic, words] of Object.entries(KEYWORDS)) if (words.some((w) => t.includes(normalize(w)))) return topic;
  return null;
}

function telegram(env) {
  return async (method, body) => {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) console.error(`telegram ${method} failed: ${data.description ?? res.status}`);
    return data;
  };
}

async function handle(update, env) {
  const msg = update.message;
  if (!msg || msg.chat?.type !== "private") return;
  const tg = telegram(env);
  const chatId = msg.chat.id;
  const text = msg.text ?? "";
  const manager = env.MANAGER_CHAT_ID ? Number(env.MANAGER_CHAT_ID) : null;

  if (text === "/id") {
    return tg("sendMessage", { chat_id: chatId, text: `رقم المحادثة: ${chatId}` });
  }

  // Manager: replying to a relayed message sends that reply to the customer.
  if (chatId === manager) {
    const ref = msg.reply_to_message;
    const target = (ref?.text ?? ref?.caption ?? "").match(/#u(\d+)/)?.[1];
    if (!target) {
      return tg("sendMessage", { chat_id: chatId, text: "للرد على زبون: اضغط على رسالته هنا ثم اختر «رد» (Reply) واكتب الرد." });
    }
    const sent = await tg("copyMessage", { chat_id: Number(target), from_chat_id: chatId, message_id: msg.message_id });
    return tg("sendMessage", {
      chat_id: chatId,
      reply_to_message_id: msg.message_id,
      text: sent.ok ? "✅ أُرسل الرد للزبون" : "❌ لم يُرسل (ربما أوقف الزبون البوت)",
    });
  }

  if (text.startsWith("/start")) {
    return tg("sendMessage", {
      chat_id: chatId,
      text: `أهلاً بك في ${store.name} 🌸\nاختر من الأزرار بالأسفل، أو اكتب سؤالك مباشرة 💬`,
      reply_markup: KEYBOARD,
    });
  }

  const topic = msg.photo || msg.document ? null : topicOf(text);
  if (topic && topic !== "contact") {
    return tg("sendMessage", { chat_id: chatId, text: store[topic], reply_markup: KEYBOARD });
  }
  if (topic === "contact" || !manager) {
    return tg("sendMessage", { chat_id: chatId, text: store.contact, reply_markup: KEYBOARD });
  }

  // Anything else (photo, order details, a question) goes to the manager.
  const from = msg.from ?? {};
  const who = [from.first_name, from.last_name].filter(Boolean).join(" ") || "زبون";
  const header = `🛍️ من: ${who}${from.username ? ` (@${from.username})` : ""} #u${chatId}`;
  const relayed = text
    ? await tg("sendMessage", { chat_id: manager, text: `${header}\n\n${text}` })
    : await tg("copyMessage", {
        chat_id: manager,
        from_chat_id: chatId,
        message_id: msg.message_id,
        caption: `${header}${msg.caption ? `\n\n${msg.caption}` : ""}`.slice(0, 1024),
      });
  return tg("sendMessage", {
    chat_id: chatId,
    text: relayed.ok ? "وصلت رسالتك ✅ سيرد عليك فريقنا قريبًا." : store.contact,
    reply_markup: KEYBOARD,
  });
}

const worker = {
  async fetch(request, env) {
    if (request.method !== "POST") return new Response("ok");
    if (request.headers.get("x-telegram-bot-api-secret-token") !== (await webhookSecret(env.TELEGRAM_BOT_TOKEN))) {
      return new Response(null, { status: 401 });
    }
    try {
      await handle(await request.json(), env);
    } catch (e) {
      console.error(e);
    }
    // Always 200 so Telegram does not resend the same update.
    return new Response("ok");
  },
};

export default worker;
