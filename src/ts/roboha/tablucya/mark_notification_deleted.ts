// ===== ФАЙЛ: src/ts/roboha/tablucya/mark_notification_deleted.ts =====

import { supabase } from "../../vxid/supabaseClient";
import type { ActNotificationPayload } from "./povidomlennya_tablucya";
import { userAccessLevel } from "./users"; // ✅ Додано для перевірки ролі

/**
 * Позначає повідомлення як видалене в БД (встановлює delit = TRUE)
 * ЛОГІКА: Видалення дозволено ТІЛЬКИ Приймальнику, чий ПІБ = pruimalnyk
 * Адміністратор НЕ може видаляти записи!
 * @param notificationId - ID повідомлення з таблиці act_changes_notifications
 * @returns true якщо успішно, false якщо помилка або немає прав
 */
export async function markNotificationAsDeleted(
  notificationId: number
): Promise<boolean> {
  try {
    // ⚠️ КРИТИЧНО: Тільки Приймальник може видаляти записи
    if (userAccessLevel !== "Приймальник") {
      console.log(
        `⏭️ [markNotificationAsDeleted] ${userAccessLevel} не може видаляти записи - тільки Приймальник`
      );
      return false;
    }

    console.log(
      `🗑️ Позначаємо повідомлення ${notificationId} як видалене (Приймальник)...`
    );

    // ✅ Приймальник може видаляти будь-які повідомлення (як і Адміністратор)
    const { error } = await supabase
      .from("act_changes_notifications")
      .update({ delit: true }) // TRUE = видалене, не показувати
      .eq("notification_id", notificationId); // ✅ БЕЗ фільтру по приймальнику

    if (error) {
      console.error(
        "❌ Помилка при позначенні повідомлення як видаленого:",
        error
      );
      return false;
    }

    console.log(
      `✅ Повідомлення ${notificationId} позначено як видалене (Приймальник)`
    );
    return true;
  } catch (err) {
    console.error("❌ Виняток при позначенні повідомлення:", err);
    return false;
  }
}

/**
 * Завантажує всі НЕвидалені повідомлення з БД (delit = FALSE)
 * і повертає їх у форматі ActNotificationPayload
 */
export async function loadUnseenNotifications(): Promise<
  ActNotificationPayload[]
> {
  try {
    console.log(
      "📥 Завантажуємо невидалені (delit = FALSE) повідомлення з БД..."
    );

    // ✅ Для Адміністратора - всі повідомлення
    if (userAccessLevel === "Адміністратор") {
      const { data, error } = await supabase
        .from("act_changes_notifications")
        .select("*")
        .eq("delit", false) // ✅ беремо тільки рядки, де delit = FALSE
        .order("data", { ascending: true }); // ✅ у тебе колонка часу називається data

      if (error) {
        console.error("❌ Помилка при завантаженні повідомлень:", error);
        return [];
      }

      if (!data || data.length === 0) {
        console.log("ℹ️ Невидалених повідомлень не знайдено");
        return [];
      }

      console.log(
        `✅ Завантажено ${data.length} невидалених повідомлень (Адміністратор)`
      );

      // Конвертуємо дані з БД в формат ActNotificationPayload
      return data.map((row: any) => ({
        act_id: row.act_id,
        notification_id: row.notification_id,
        changed_by_surname: row.changed_by_surname || "Невідомо",
        item_name: row.item_name || "",
        dodav_vudaluv: row.dodav_vudaluv ?? true,
        created_at: row.data ?? row.created_at,
        pib: row.pib, // ✅ ПІБ
        auto: row.auto, // ✅ Авто
        pruimalnyk: row.pruimalnyk, // ✅ Приймальник
      }));
    }

    // ✅ Для Приймальника - показуємо ВСІ повідомлення (без фільтрації)
    if (userAccessLevel === "Приймальник") {
      console.log(`📋 Завантажуємо ВСІ повідомлення для Приймальника`);

      const { data, error } = await supabase
        .from("act_changes_notifications")
        .select("*")
        .eq("delit", false) // ✅ БЕЗ фільтру по приймальнику
        .order("data", { ascending: true });

      if (error) {
        console.error("❌ Помилка при завантаженні повідомлень:", error);
        return [];
      }

      if (!data || data.length === 0) {
        console.log(`ℹ️ Повідомлень не знайдено`);
        return [];
      }

      console.log(
        `✅ Завантажено ${data.length} повідомлень для Приймальника`
      );

      // Конвертуємо дані з БД в формат ActNotificationPayload
      return data.map((row: any) => ({
        act_id: row.act_id,
        notification_id: row.notification_id,
        changed_by_surname: row.changed_by_surname || "Невідомо",
        item_name: row.item_name || "",
        dodav_vudaluv: row.dodav_vudaluv ?? true,
        created_at: row.data ?? row.created_at,
        pib: row.pib, // ✅ ПІБ
        auto: row.auto, // ✅ Авто
        pruimalnyk: row.pruimalnyk, // ✅ Приймальник
      }));
    }

    // ✅ Для інших ролей - немає повідомлень
    return [];
  } catch (err) {
    console.error("❌ Виняток при завантаженні повідомлень:", err);
    return [];
  }
}
