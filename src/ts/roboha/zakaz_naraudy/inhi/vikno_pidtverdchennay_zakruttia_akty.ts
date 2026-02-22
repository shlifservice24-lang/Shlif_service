// src/ts/roboha/zakaz_naraudy/inhi/vikno_pidtverdchennay_zakruttia_akty.ts

import { showNotification } from "./vspluvauhe_povidomlenna";
import { closeActAndMarkSlyusars } from "./save_work";
import { refreshActsTable } from "../../tablucya/tablucya";
import { ACT_ITEMS_TABLE_CONTAINER_ID } from "../globalCache";
import { userAccessLevel } from "../../tablucya/users";
import { supabase } from "../../../vxid/supabaseClient";

export const viknoPidtverdchennayZakruttiaAktyId =
  "vikno_pidtverdchennay_zakruttia_akty-modal";

export function createViknoPidtverdchennayZakruttiaAkty(): HTMLDivElement {
  const overlay = document.createElement("div");
  overlay.id = viknoPidtverdchennayZakruttiaAktyId;
  overlay.className = "vikno_pidtverdchennay_zakruttia_akty-overlay";
  overlay.style.display = "none";

  const modal = document.createElement("div");
  modal.className = "vikno_pidtverdchennay_zakruttia_akty-content";
  modal.innerHTML = `
    <p id="vikno_pidtverdchennay_zakruttia_akty-message">Підтвердити закриття акту?</p>
    <div class="vikno_pidtverdchennay_zakruttia_akty-buttons save-buttons">
      <button id="vikno_pidtverdchennay_zakruttia_akty-confirm" class="vikno_pidtverdchennay_zakruttia_akty-confirm-btn btn-save-confirm">Так</button>
      <div class="payment-split-container" style="display: flex; gap: 8px; flex-direction: column; text-align: left; padding: 10px; background: #f9f9f9; border-radius: 6px; margin: 10px 0;">
        <label style="display: flex; justify-content: space-between; align-items: center; font-weight: 500;">💵 Готівка <input type="number" id="pay-cash-input" value="0" class="payment-input" style="width: 100px; padding: 4px; border: 1px solid #ccc; border-radius: 4px;"></label>
        <label style="display: flex; justify-content: space-between; align-items: center; font-weight: 500;">💳 Картка <input type="number" id="pay-card-input" value="0" class="payment-input" style="width: 100px; padding: 4px; border: 1px solid #ccc; border-radius: 4px;"></label>
        <label style="display: flex; justify-content: space-between; align-items: center; font-weight: 500;">🏦 IBAN <input type="number" id="pay-iban-input" value="0" class="payment-input" style="width: 100px; padding: 4px; border: 1px solid #ccc; border-radius: 4px;"></label>
      </div>
      <button id="vikno_pidtverdchennay_zakruttia_akty-cancel" class="vikno_pidtverdchennay_zakruttia_akty-cancel-btn btn-save-cancel">Ні</button>
    </div>
  `;
  overlay.appendChild(modal);
  return overlay;
}

function ensureModalMounted(): HTMLElement {
  let el = document.getElementById(viknoPidtverdchennayZakruttiaAktyId);
  if (!el) {
    el = createViknoPidtverdchennayZakruttiaAkty();
    document.body.appendChild(el);
  }
  return el;
}

/**
 * Перевірка наявності попереджень у таблиці акту
 * Повертає true якщо помилок немає, false якщо є попередження
 */
function checkForWarnings(): boolean {
  const container = document.getElementById(ACT_ITEMS_TABLE_CONTAINER_ID);
  if (!container) return true;

  const qtyWarnings = container.querySelectorAll('.qty-cell[data-warn="1"]');
  const priceWarnings = container.querySelectorAll(
    '.price-cell[data-warnprice="1"]'
  );
  const slyusarSumWarnings = container.querySelectorAll(
    '.slyusar-sum-cell[data-warnzp="1"]'
  );

  const pomulka =
    qtyWarnings.length === 0 &&
    priceWarnings.length === 0 &&
    slyusarSumWarnings.length === 0;

  if (!pomulka) {
    console.warn(
      `Знайдено попередження: кількість=${qtyWarnings.length}, ціна=${priceWarnings.length}, зарплата=${slyusarSumWarnings.length}`
    );
  }

  return pomulka;
}

/**
 * Показ модалки підтвердження та закриття акту з відправкою SMS
 * ТЕПЕР:
 *  - не блокує закриття при попередженнях для не-адміністратора
 *  - завжди показує попередження, якщо вони є
 *  - дає користувачу вибрати: закривати чи ні
 */
export function showViknoPidtverdchennayZakruttiaAkty(
  actId: number
): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = ensureModalMounted();

    // Перевіряємо, чи є попередження в таблиці
    const pomulka = checkForWarnings(); // true = без попереджень
    const hasWarnings = !pomulka;

    const messageEl = modal.querySelector(
      "#vikno_pidtverdchennay_zakruttia_akty-message"
    ) as HTMLParagraphElement | null;

    if (messageEl) {
      if (hasWarnings) {
        // Є попередження — показуємо розширений текст
        messageEl.innerHTML = `
          <strong style="color: #ff9800;">⚠️ Увага!</strong><br>
          Виявлено попередження про перевищення кількості, надто низьку ціну
          або зарплату більшу ніж сума роботи.<br>
          Ви впевнені, що хочете закрити акт №${actId}?<br>
          <span style="font-size: 0.9em; opacity: 0.8;">
            Ваш доступ: ${userAccessLevel || "Невідомо"}
          </span>
        `;
      } else {
        // Попереджень немає — стандартний текст
        messageEl.textContent = `Підтвердити закриття акту №${actId}`;
      }
    }

    modal.style.display = "flex";

    const pN = (t: string | null | undefined) => parseFloat((t ?? "0").replace(/\s/g, "").replace(",", ".")) || 0;
    const worksSum = pN(document.getElementById("total-works-sum")?.textContent);
    const detailsSum = pN(document.getElementById("total-details-sum")?.textContent);
    const actualDiscountAmount = pN((document.getElementById("editable-discount-amount") as HTMLInputElement)?.value);
    const actTotalSum = Math.round((worksSum - actualDiscountAmount) + detailsSum);

    const avansInput = document.getElementById("editable-avans") as HTMLInputElement | null;
    const avansVal = avansInput ? Number(avansInput.value.replace(/\s/g, "")) : 0;
    const avansTypeContainer = document.getElementById("avans-type-container");
    const tupAvansu = avansTypeContainer?.getAttribute("data-selected-type") || "готівка";

    const cashInput = document.getElementById("pay-cash-input") as HTMLInputElement | null;
    const cardInput = document.getElementById("pay-card-input") as HTMLInputElement | null;
    const ibanInput = document.getElementById("pay-iban-input") as HTMLInputElement | null;

    let minCash = tupAvansu.toLowerCase() === "готівка" ? avansVal : 0;
    let minCard = (tupAvansu.toLowerCase() === "карта" || tupAvansu.toLowerCase() === "картка") ? avansVal : 0;
    let minIban = tupAvansu.toLowerCase() === "iban" ? avansVal : 0;

    let initCash = minCash;
    let initCard = minCard;
    let initIban = minIban;

    initCash += (actTotalSum - initCash - initCard - initIban);
    if (initCash < minCash) initCash = minCash;

    if (cashInput) cashInput.value = String(initCash);
    if (cardInput) cardInput.value = String(initCard);
    if (ibanInput) ibanInput.value = String(initIban);

    const syncInputs = (changed: 'cash' | 'card' | 'iban', enforceMins: boolean = false) => {
      let c = Number(cashInput?.value) || 0;
      let cd = Number(cardInput?.value) || 0;
      let i = Number(ibanInput?.value) || 0;

      if (enforceMins) {
        if (c < minCash) { c = minCash; if (cashInput) cashInput.value = String(c); }
        if (cd < minCard) { cd = minCard; if (cardInput) cardInput.value = String(cd); }
        if (i < minIban) { i = minIban; if (ibanInput) ibanInput.value = String(i); }
      }

      if (changed === 'cash' && cardInput) {
        cd = actTotalSum - c - i;
        if (cd < minCard) { c += (cd - minCard); cd = minCard; if (cashInput) cashInput.value = String(c); }
        cardInput.value = String(cd);
      } else if (changed === 'card' && cashInput) {
        c = actTotalSum - cd - i;
        if (c < minCash) { cd += (c - minCash); c = minCash; if (cardInput) cardInput.value = String(cd); }
        cashInput.value = String(c);
      } else if (changed === 'iban' && cashInput) {
        c = actTotalSum - cd - i;
        if (c < minCash) { i += (c - minCash); c = minCash; if (ibanInput) ibanInput.value = String(i); }
        cashInput.value = String(c);
      }
    };

    cashInput?.addEventListener("input", () => syncInputs('cash', false));
    cardInput?.addEventListener("input", () => syncInputs('card', false));
    ibanInput?.addEventListener("input", () => syncInputs('iban', false));

    cashInput?.addEventListener("change", () => syncInputs('cash', true));
    cardInput?.addEventListener("change", () => syncInputs('card', true));
    ibanInput?.addEventListener("change", () => syncInputs('iban', true));

    const confirmBtn = document.getElementById(
      "vikno_pidtverdchennay_zakruttia_akty-confirm"
    ) as HTMLButtonElement | null;
    const cancelBtn = document.getElementById(
      "vikno_pidtverdchennay_zakruttia_akty-cancel"
    ) as HTMLButtonElement | null;

    if (!confirmBtn || !cancelBtn) {
      console.error("Кнопки підтвердження/скасування не знайдені");
      modal.style.display = "none";
      return resolve(false);
    }

    const cleanup = () => {
      modal.style.display = "none";
      confirmBtn.removeEventListener("click", onConfirm);
      cancelBtn.removeEventListener("click", onCancel);
      // Event listeners for inputs do not strongly leak since modal persists, but ideally could be cleaned.
    };

    const onCancel = () => {
      cleanup();
      resolve(false);
    };

    const onConfirm = async () => {
      confirmBtn.disabled = true;
      try {
        const cashQInput = document.getElementById("pay-cash-input") as HTMLInputElement | null;
        const cardQInput = document.getElementById("pay-card-input") as HTMLInputElement | null;
        const ibanQInput = document.getElementById("pay-iban-input") as HTMLInputElement | null;

        const cashVal = Number(cashQInput?.value) || 0;
        const cardVal = Number(cardQInput?.value) || 0;
        const ibanVal = Number(ibanQInput?.value) || 0;

        const totalEntered = cashVal + cardVal + ibanVal;

        const pN = (t: string | null | undefined) => parseFloat((t ?? "0").replace(/\s/g, "").replace(",", ".")) || 0;
        const worksSum = pN(document.getElementById("total-works-sum")?.textContent);
        const detailsSum = pN(document.getElementById("total-details-sum")?.textContent);
        const actualDiscountAmount = pN((document.getElementById("editable-discount-amount") as HTMLInputElement)?.value);

        const sumAfterDiscount = Math.round((worksSum - actualDiscountAmount) + detailsSum);

        if (totalEntered > sumAfterDiscount) {
          showNotification(`Сума оплат (${totalEntered} грн) перевищує суму акту (${sumAfterDiscount} грн)`, "warning", 5000);
          confirmBtn.disabled = false;
          return;
        }

        const paymentData = {
          "готівка": cashVal,
          "картка": cardVal,
          "iban": ibanVal
        };
        const selectedPaymentType = JSON.stringify(paymentData);

        console.log(`💳 Обрано тип оплати: ${selectedPaymentType}`);

        showNotification("Закриваємо акт...", "info", 1200);

        // Основне закриття акту + розмітка слюсарів
        await closeActAndMarkSlyusars(actId);

        // Зберігаємо тип оплати в acts.tupOplatu
        const { error: updatePaymentError } = await supabase
          .from("acts")
          .update({ tupOplatu: selectedPaymentType })
          .eq("act_id", actId);

        if (updatePaymentError) {
          console.error(
            "❌ Помилка збереження типу оплати:",
            updatePaymentError
          );
        } else {
          console.log(
            `✅ Тип оплати "${selectedPaymentType}" збережено для акту ${actId}`
          );
        }

        // SMS відправка видалена звідси за запитом користувача

        await refreshActsTable();
        cleanup();

        if (hasWarnings) {
          showNotification("Акт закрито (з попередженнями)", "warning", 2500);
        } else {
          showNotification("Акт успішно закрито", "success", 2000);
        }

        resolve(true);
      } catch (e: any) {
        console.error(e);
        showNotification(
          "Помилка при закритті акту: " + (e?.message || e),
          "error",
          2500
        );
        confirmBtn.disabled = false;
      }
    };

    confirmBtn.addEventListener("click", onConfirm);
    cancelBtn.addEventListener("click", onCancel);
  });
}
