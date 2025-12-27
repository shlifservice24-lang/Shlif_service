// src/ts/roboha/zakaz_naraudy/inhi/faktura.ts

import {
  renderInvoicePreviewModal,
  getCurrentActDataFromDOM,
} from "./fakturaRaxunok";
import { renderActPreviewModal } from "./fakturaAct";
import { supabase } from "../../../vxid/supabaseClient";
import { showNotification } from "./vspluvauhe_povidomlenna";

export const MODAL_ACT_RAXUNOK_ID = "modal-act-raxunok";
const PASSWORD_CHECK_MODAL_ID = "password-check-modal-for-invoice";

/* --- Модальне вікно перевірки пароля (без змін) --- */

function createPasswordCheckModal(): HTMLElement {
  const modal = document.createElement("div");
  modal.id = PASSWORD_CHECK_MODAL_ID;
  modal.className = "password-check-overlay";
  modal.style.cssText = `
    position: fixed;
    inset: 0;
    background-color: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10002;
  `;

  modal.innerHTML = `
    <div style="
      background: white;
      border-radius: 16px;
      padding: 40px;
      max-width: 400px;
      width: 90%;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    ">
      <h2 style="margin: 0 0 20px 0; text-align: center; color: #1a1a1a;">
        🔐 Підтвердження доступу
      </h2>
      <input 
        type="password" 
        id="invoice-password-input" 
        placeholder="Пароль..."
        style="
          width: 100%;
          padding: 12px;
          border: 2px solid #e0e0e0;
          border-radius: 8px;
          font-size: 16px;
          box-sizing: border-box;
          margin-bottom: 10px;
        "
      />
      <div id="password-error" style="
        color: #f44336;
        font-size: 14px;
        margin: 10px 0;
        display: none;
        text-align: center;
      "></div>
      <div style="display: flex; gap: 12px; margin-top: 20px;">
        <button id="password-cancel-btn" style="
          flex: 1;
          padding: 12px;
          border: 2px solid #e0e0e0;
          border-radius: 8px;
          background: white;
          cursor: pointer;
          font-size: 16px;
          font-weight: 600;
          transition: all 0.2s ease;
        ">
          Скасувати
        </button>
        <button id="password-confirm-btn" style="
          flex: 1;
          padding: 12px;
          border: none;
          border-radius: 8px;
          background: #2196f3;
          color: white;
          cursor: pointer;
          font-size: 16px;
          font-weight: 600;
          transition: all 0.2s ease;
        ">
          Підтвердити
        </button>
      </div>
    </div>
  `;

  return modal;
}

async function checkPasswordFromLocalStorage(
  inputPassword: string
): Promise<boolean> {
  try {
    const storedData = localStorage.getItem("userAuthData");
    if (!storedData) {
      console.warn("⚠️ Немає збережених даних користувача");
      return false;
    }

    const userData = JSON.parse(storedData);
    const savedPassword = userData?.Пароль;

    if (!savedPassword) {
      console.warn("⚠️ Пароль не знайдено в localStorage");
      return false;
    }

    if (inputPassword === savedPassword) {
      console.log("✅ Пароль підтверджено з localStorage");
      return true;
    }

    const { data: slyusars, error } = await supabase
      .from("slyusars")
      .select("data");

    if (error || !slyusars) {
      console.error("❌ Помилка отримання даних з БД:", error);
      return false;
    }

    const foundUser = slyusars.find((slyusar) => {
      try {
        const slyusarData =
          typeof slyusar.data === "string"
            ? JSON.parse(slyusar.data)
            : slyusar.data;
        return slyusarData && String(slyusarData["Пароль"]) === inputPassword;
      } catch {
        return false;
      }
    });

    if (foundUser) {
      console.log("✅ Пароль підтверджено з БД");
      return true;
    }

    return false;
  } catch (error) {
    console.error("💥 Помилка при перевірці пароля:", error);
    return false;
  }
}

function showPasswordCheckModal(): Promise<boolean> {
  return new Promise((resolve) => {
    const oldModal = document.getElementById(PASSWORD_CHECK_MODAL_ID);
    if (oldModal) oldModal.remove();

    const modal = createPasswordCheckModal();
    document.body.appendChild(modal);

    const input = modal.querySelector(
      "#invoice-password-input"
    ) as HTMLInputElement | null;
    const confirmBtn = modal.querySelector(
      "#password-confirm-btn"
    ) as HTMLButtonElement | null;
    const cancelBtn = modal.querySelector(
      "#password-cancel-btn"
    ) as HTMLButtonElement | null;
    const errorDiv = modal.querySelector(
      "#password-error"
    ) as HTMLDivElement | null;

    if (!input || !confirmBtn || !cancelBtn || !errorDiv) {
      console.error("❌ Не знайдені елементи модалки пароля");
      modal.remove();
      resolve(false);
      return;
    }

    setTimeout(() => input.focus(), 100);

    let resolved = false;

    const cleanup = () => {
      modal.remove();
    };

    const resolveOnce = (value: boolean) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(value);
    };

    const handleConfirm = async () => {
      const password = input.value.trim();

      if (!password) {
        errorDiv.textContent = "❌ Введіть пароль";
        errorDiv.style.display = "block";
        return;
      }

      confirmBtn.disabled = true;
      confirmBtn.textContent = "Перевірка...";
      errorDiv.style.display = "none";

      const isValid = await checkPasswordFromLocalStorage(password);

      if (isValid) {
        showNotification("✅ Доступ підтверджено", "success");
        resolveOnce(true);
      } else {
        errorDiv.textContent = "❌ Невірний пароль";
        errorDiv.style.display = "block";
        confirmBtn.disabled = false;
        confirmBtn.textContent = "Підтвердити";
        input.value = "";
        input.focus();
      }
    };

    const handleCancel = () => {
      showNotification("Скасовано", "warning");
      resolveOnce(false);
    };

    confirmBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      void handleConfirm();
    });

    cancelBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleCancel();
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void handleConfirm();
      }
    });

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
      }
    };
    document.addEventListener("keydown", handleEscape);

    const originalRemove = modal.remove.bind(modal);
    modal.remove = () => {
      document.removeEventListener("keydown", handleEscape);
      originalRemove();
    };
  });
}

/* --- Модальне вікно вибору (Рахунок або Акт) --- */

export function createModalActRaxunok(): HTMLElement {
  const modal = document.createElement("div");
  modal.id = MODAL_ACT_RAXUNOK_ID;
  modal.className = "act-raxunok-overlay hidden";
  modal.innerHTML = `
    <div class="act-raxunok-content">
      <button class="act-raxunok-close" id="act-raxunok-close">✕</button>
      <div class="act-raxunok-header"><h2>Оберіть тип документа</h2></div>
      <div class="act-raxunok-buttons">
        <button class="act-raxunok-btn act-raxunok-btn-invoice" id="create-raxunok-btn">
          <span class="btn-icon">🧾</span>
          <span class="btn-text">Рахунок</span>
          <span class="btn-description">Попередній рахунок</span>
        </button>
        <button class="act-raxunok-btn act-raxunok-btn-act" id="create-act-only-btn">
          <span class="btn-icon">📋</span>
          <span class="btn-text">Акт</span>
          <span class="btn-description">Акт виконаних робіт</span>
        </button>
      </div>
    </div>
  `;
  return modal;
}

export function openModalActRaxunok(): void {
  const modal = document.getElementById(MODAL_ACT_RAXUNOK_ID);
  if (!modal) return;
  modal.classList.remove("hidden");
}

export function closeModalActRaxunok(): void {
  const modal = document.getElementById(MODAL_ACT_RAXUNOK_ID);
  if (modal) modal.classList.add("hidden");
}

export function initModalActRaxunokHandlers(): void {
  const closeBtn = document.getElementById("act-raxunok-close");
  closeBtn?.addEventListener("click", closeModalActRaxunok);

  const modal = document.getElementById(MODAL_ACT_RAXUNOK_ID);
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) closeModalActRaxunok();
  });

  // Кнопка "Рахунок"
  const raxunokBtn = document.getElementById("create-raxunok-btn");
  raxunokBtn?.addEventListener("click", async () => {
    try {
      const actData = getCurrentActDataFromDOM();
      if (!actData) {
        showNotification("Помилка: дані акту не знайдено", "error");
        return;
      }

      await renderInvoicePreviewModal(actData);
      closeModalActRaxunok();
    } catch (error) {
      console.error(error);
      showNotification("Помилка при створенні рахунку", "error");
    }
  });

  // Кнопка "Акт" - ЗМІНЕНО
  const actBtn = document.getElementById("create-act-only-btn");
  actBtn?.addEventListener("click", async () => {
    try {
      // 1. Отримуємо поточні дані з DOM
      const actData = getCurrentActDataFromDOM();
      if (!actData) {
        showNotification("Помилка: дані акту не знайдено", "error");
        return;
      }

      // 2. Отримуємо ID акту з DOM
      const actNumberSpan = document.getElementById("act-number");
      const extractedActId = actNumberSpan
        ? parseInt(actNumberSpan.innerText.trim())
        : 0;

      // Ініціалізуємо змінні в об'єкті actData
      actData.realActId = extractedActId;
      actData.foundFakturaId = null;
      actData.foundContrAgentRaxunok = null; // Нове поле
      actData.foundContrAgentRaxunokData = null; // Нове поле

      // 3. Якщо ID валідний, робимо розширений запит до БД
      if (extractedActId > 0) {
        const { data: dbData, error } = await supabase
          .from("acts")
          // 👇 ДОДАЛИ НОВІ ПОЛЯ В SELECT
          .select("faktura_id, contragent_raxunok, contragent_raxunok_data")
          .eq("act_id", extractedActId)
          .single();

        if (error) {
          console.error("❌ Помилка пошуку в БД acts:", error);
        } else if (dbData) {
          // 4. Записуємо отримані дані
          actData.foundFakturaId = dbData.faktura_id;
          actData.foundContrAgentRaxunok = dbData.contragent_raxunok; // Зберігаємо номер
          actData.foundContrAgentRaxunokData = dbData.contragent_raxunok_data; // Зберігаємо дату

          console.log("✅ Дані з БД отримано:", dbData);
        }
      }

      // 5. Викликаємо рендер
      await renderActPreviewModal(actData);

      closeModalActRaxunok();
    } catch (error) {
      console.error(error);
      showNotification("Помилка при створенні акту", "error");
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModalActRaxunok();
  });
}

export function initCreateActRaxunokButton(): void {
  const createActBtn = document.getElementById("create-act-btn");
  if (!createActBtn) return;

  const newBtn = createActBtn.cloneNode(true) as HTMLElement;
  createActBtn.parentNode?.replaceChild(newBtn, createActBtn);

  newBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const isPasswordValid = await showPasswordCheckModal();

    if (isPasswordValid) {
      openModalActRaxunok();
    }
  });
}
