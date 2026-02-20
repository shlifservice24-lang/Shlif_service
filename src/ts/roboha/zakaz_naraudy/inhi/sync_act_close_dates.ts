// Скрипт для синхронізації дат закриття актів між таблицями acts та slyusars
// Запуск: відкрийте консоль браузера на сторінці додатку та вставте цей код

import { supabase } from "../../../vxid/supabaseClient";

/**
 * Конвертує дату в формат YYYY-MM-DD
 */
function toISODateOnly(dt: string | Date | null | undefined): string | null {
    if (!dt) return null;
    const d = new Date(dt);
    if (isNaN(+d)) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
}

/**
 * Основна функція синхронізації
 */
async function syncActCloseDatesFromActsToSlyusars(): Promise<void> {
    console.log("🚀 Початок синхронізації дат закриття актів...");

    try {
        // 1️⃣ Отримуємо всі акти з таблиці acts
        console.log("📊 Завантаження даних з таблиці acts...");
        const { data: actsData, error: actsError } = await supabase
            .from("acts")
            .select("act_id, date_off");

        if (actsError) {
            console.error("❌ Помилка завантаження acts:", actsError.message);
            return;
        }

        if (!actsData || actsData.length === 0) {
            console.log("⚠️ Немає даних у таблиці acts");
            return;
        }

        console.log(`✅ Завантажено ${actsData.length} актів з таблиці acts`);

        // 2️⃣ Створюємо Map для швидкого пошуку: act_id → date_off (YYYY-MM-DD)
        const actsDateOffMap = new Map<string, string | null>();

        for (const act of actsData) {
            const actId = String(act.act_id);
            const dateOff = toISODateOnly(act.date_off);
            actsDateOffMap.set(actId, dateOff);
        }

        console.log(`📋 Створено мапу для ${actsDateOffMap.size} актів`);

        // 3️⃣ Отримуємо всіх користувачів з таблиці slyusars
        console.log("👥 Завантаження даних з таблиці slyusars...");
        const { data: slyusarsData, error: slyusarsError } = await supabase
            .from("slyusars")
            .select("*");

        if (slyusarsError) {
            console.error("❌ Помилка завантаження slyusars:", slyusarsError.message);
            return;
        }

        if (!slyusarsData || slyusarsData.length === 0) {
            console.log("⚠️ Немає даних у таблиці slyusars");
            return;
        }

        console.log(`✅ Завантажено ${slyusarsData.length} користувачів з таблиці slyusars`);

        // 4️⃣ Визначаємо первинний ключ
        const availableKeys = Object.keys(slyusarsData[0] || {});
        const primaryKeyCandidates = ["slyusar_id", "id", "slyusars_id", "uid", "pk"];

        let primaryKey: string | null = null;
        for (const candidate of primaryKeyCandidates) {
            if (availableKeys.includes(candidate)) {
                primaryKey = candidate;
                console.log(`🔑 Використовується первинний ключ: "${primaryKey}"`);
                break;
            }
        }

        if (!primaryKey) {
            console.error("❌ Не вдалося визначити первинний ключ для slyusars");
            console.error("💡 Доступні ключі:", availableKeys);
            return;
        }

        // 5️⃣ Обробляємо кожного користувача
        let totalUsersProcessed = 0;
        let totalActsUpdated = 0;
        let totalUsersUpdated = 0;

        for (const slyusarRow of slyusarsData) {
            let slyusarData: any = {};

            // Парсимо JSON дані
            if (typeof slyusarRow.data === "string") {
                try {
                    slyusarData = JSON.parse(slyusarRow.data);
                } catch (e) {
                    console.warn(`⚠️ Не вдалося розпарсити дані для запису ${slyusarRow[primaryKey]}`);
                    continue;
                }
            } else if (typeof slyusarRow.data === "object" && slyusarRow.data !== null) {
                slyusarData = slyusarRow.data;
            } else {
                console.warn(`⚠️ Невалідні дані для запису ${slyusarRow[primaryKey]}`);
                continue;
            }

            const userName = slyusarData["Name"] || "Невідомий";
            const userAccess = slyusarData["Доступ"] || "";

            // Перевіряємо наявність історії
            if (!slyusarData["Історія"] || typeof slyusarData["Історія"] !== "object") {
                console.log(`⏭️ Пропускаємо ${userName} - немає історії`);
                continue;
            }

            totalUsersProcessed++;
            const history = slyusarData["Історія"];
            let userActsUpdated = 0;
            let userModified = false;

            // 6️⃣ Проходимо по всіх датах в історії
            for (const dateKey in history) {
                if (!Array.isArray(history[dateKey])) {
                    continue;
                }

                const dayBucket = history[dateKey];

                // 7️⃣ Проходимо по всіх актах за цю дату
                for (const actEntry of dayBucket) {
                    const actNumber = actEntry?.["Акт"];
                    if (!actNumber) continue;

                    const actId = String(actNumber);
                    const currentDateClose = actEntry["ДатаЗакриття"];

                    // 8️⃣ Перевіряємо чи потрібно оновити дату
                    // Оновлюємо якщо:
                    // - ДатаЗакриття = null АБО
                    // - ДатаЗакриття відрізняється від date_off з acts
                    const correctDateClose = actsDateOffMap.get(actId);

                    if (correctDateClose !== undefined && currentDateClose !== correctDateClose) {
                        console.log(
                            `🔄 ${userName} (${userAccess}): Акт ${actId} - "${currentDateClose}" → "${correctDateClose}"`
                        );

                        actEntry["ДатаЗакриття"] = correctDateClose;
                        userActsUpdated++;
                        userModified = true;
                    }
                }
            }

            // 9️⃣ Зберігаємо оновлені дані назад у базу
            if (userModified) {
                const { error: updateError } = await supabase
                    .from("slyusars")
                    .update({ data: slyusarData })
                    .eq(primaryKey, slyusarRow[primaryKey]);

                if (updateError) {
                    console.error(
                        `❌ Помилка оновлення slyusars#${slyusarRow[primaryKey]}:`,
                        updateError.message
                    );
                } else {
                    totalActsUpdated += userActsUpdated;
                    totalUsersUpdated++;
                    console.log(
                        `✅ ${userName}: оновлено ${userActsUpdated} актів`
                    );
                }
            }
        }

        // 🔟 Підсумок
        console.log("\n" + "=".repeat(60));
        console.log("📊 ПІДСУМОК СИНХРОНІЗАЦІЇ:");
        console.log("=".repeat(60));
        console.log(`👥 Оброблено користувачів: ${totalUsersProcessed}`);
        console.log(`✅ Оновлено користувачів: ${totalUsersUpdated}`);
        console.log(`📋 Оновлено актів: ${totalActsUpdated}`);
        console.log("=".repeat(60));

        if (totalActsUpdated > 0) {
            alert(`✅ Синхронізація завершена!\n\nОновлено ${totalActsUpdated} актів у ${totalUsersUpdated} користувачів.`);
        } else {
            alert("ℹ️ Всі дати вже синхронізовані. Оновлень не потрібно.");
        }

    } catch (err) {
        console.error("❌ Критична помилка синхронізації:", err);
        alert("❌ Помилка синхронізації. Перевірте консоль для деталей.");
    }
}

// Експортуємо функцію для використання
export { syncActCloseDatesFromActsToSlyusars };

// Автоматичний запуск при імпорті (можна закоментувати)
// syncActCloseDatesFromActsToSlyusars();
