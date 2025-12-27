// src/ts/vxid/login.ts
// 🔐 СИСТЕМА ВХОДУ: Google OAuth + Whitelist перевірка
import { supabase } from "./supabaseClient";
import { isEmailAllowed } from "../../../constants";

console.log("🔒 Ініціалізація системи входу...");

// 🚪 Вхід через Google OAuth
export async function signInWithGoogle() {
  console.log("🔑 Запуск Google OAuth...");

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: "https://shlifservice24-lang.github.io/Shlif_service/",
    },
  });

  if (error) {
    console.error("❌ Помилка Google OAuth:", error);
    alert("Помилка входу. Спробуйте ще раз.");
  } else {
    console.log("✅ Google OAuth ініційовано");
  }
}

// 🔍 Перевірка сесії при завантаженні сторінки
async function checkExistingSession() {
  console.log("🔍 Перевірка існуючої сесії...");

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    console.error("❌ Помилка отримання сесії:", error);
    return;
  }

  if (session?.user) {
    console.log("👤 Знайдено сесію:", session.user.email);
    await handleAuthenticatedUser(session.user);
  } else {
    console.log("📭 Немає активної сесії");
  }
}

// 🔐 Обробка автентифікованого користувача
async function handleAuthenticatedUser(user: any) {
  const email = user.email;

  if (!isEmailAllowed(email)) {
    console.warn("⛔ Email НЕ в whitelist:", email);
    alert(
      `Доступ заборонено.\nВаш email: ${email}\n\nЗверніться до адміністратора.`
    );
    await supabase.auth.signOut();
    return;
  }

  console.log("✅ Email дозволено:", email);
  console.log("➡️ Перенаправлення на main.html");
  window.location.href = "/STO/main.html";
}

// 🎯 Відстеження змін авторизації
supabase.auth.onAuthStateChange(async (event, session) => {
  console.log("🔔 Auth event:", event);

  if (event === "SIGNED_IN" && session?.user) {
    await handleAuthenticatedUser(session.user);
  } else if (event === "SIGNED_OUT") {
    console.log("🚪 Користувач вийшов");
  }
});

// 🧠 Ініціалізація при завантаженні
document.addEventListener("DOMContentLoaded", async () => {
  console.log("📄 DOM завантажено");

  // Перевіряємо чи вже є сесія
  await checkExistingSession();

  // Прив'язка кнопки входу
  const loginButton = document.getElementById("login");
  if (loginButton) {
    loginButton.addEventListener("click", (e) => {
      e.preventDefault();
      signInWithGoogle();
    });
    console.log("🔘 Кнопка входу підключена");
  } else {
    console.warn("⚠️ Кнопка login не знайдена");
  }
});
