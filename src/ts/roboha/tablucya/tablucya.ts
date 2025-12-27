// ===== ФАЙЛ: src/ts/roboha/tablucya/tablucya.ts =====

import { supabase } from "../../vxid/supabaseClient";
import { showModal } from "../zakaz_naraudy/modalMain";
import {
  showLoginModalBeforeTable,
  isUserAuthenticated,
  userAccessLevel,
  logoutFromSystemAndRedirect,
  canUserViewActs,
  canUserOpenActs,
} from "./users";

// 👇 ІМПОРТ НОВОЇ ФУНКЦІЇ ПОВІДОМЛЕНЬ
import { showRealtimeActNotification, removeNotificationsForAct, loadAndShowExistingNotifications } from "./povidomlennya_tablucya";

document.addEventListener("click", (e) => {
  const target = e.target as HTMLElement | null;
  if (target && target.closest("#logout-link")) {
    e.preventDefault();
    logoutFromSystemAndRedirect();
  }
});

// =============================================================================
// ГЛОБАЛЬНІ ЗМІННІ
// =============================================================================

let actsGlobal: any[] = [];
let clientsGlobal: any[] = [];
let carsGlobal: any[] = [];
// Зберігаємо ID змінених актів
let modifiedActIdsGlobal: Set<number> = new Set();
let sortByDateStep = 0;

// =============================================================================
// УТИЛІТИ
// =============================================================================

function safeParseJSON(data: any): any {
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
  return data;
}

function formatDate(date: Date): string {
  return `${date.getDate().toString().padStart(2, "0")}.${(date.getMonth() + 1)
    .toString()
    .padStart(2, "0")}.${date.getFullYear()}`;
}

function formatDateTime(date: Date): { date: string; time: string } {
  const dateStr = formatDate(date);
  const timeStr = `${date.getHours().toString().padStart(2, "0")}:${date
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
  return { date: dateStr, time: timeStr };
}

function convertISOtoShortDate(isoDate: string | null): string | null {
  if (!isoDate) return null;
  try {
    const date = new Date(isoDate);
    if (isNaN(date.getTime())) return null;
    const day = date.getDate().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const year = date.getFullYear().toString().slice(-2);
    return `${day}.${month}.${year}`;
  } catch {
    return null;
  }
}

function validateDateFormat(dateStr: string): boolean {
  const dateRegex = /^\d{2}\.\d{2}\.\d{4}$/;
  if (!dateRegex.test(dateStr)) return false;
  const [d, m, y] = dateStr.split(".");
  const day = parseInt(d);
  const month = parseInt(m);
  const year = parseInt(y);
  return (
    day >= 1 &&
    day <= 31 &&
    month >= 1 &&
    month <= 12 &&
    year >= 2000 &&
    year <= 2100
  );
}

// =============================================================================
// ЛОГІКА REALTIME ТА СПОВІЩЕНЬ
// =============================================================================

/**
 * 1. Завантажує існуючі сповіщення при старті (щоб підсвітити те, що вже є)
 */
async function fetchModifiedActIds(): Promise<Set<number>> {
  if (userAccessLevel !== "Адміністратор") return new Set();

  const { data, error } = await supabase
    .from("act_changes_notifications")
    .select("act_id")
    .eq("delit", false);            // ✅ тільки "не видалені" нотифікації

  if (error) {
    console.error("❌ Помилка завантаження сповіщень:", error);
    return new Set();
  }

  const ids = new Set((data || []).map((item) => Number(item.act_id)));
  return ids;
}


/**
 * 2. Підписується на нові сповіщення (PUSH) без перезавантаження таблиці
 */
function subscribeToActNotifications() {
  if (userAccessLevel !== "Адміністратор") return;

  console.log("📡 Підключення до Realtime повідомлень (Адміністратор)...");

  supabase
    .channel("act-notifications-channel")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "act_changes_notifications",
      },
      (payload) => {
        console.log("📡 [Realtime INSERT] Отримано нове повідомлення:", payload.new);
        const newNotification = payload.new;
        if (newNotification && newNotification.act_id) {
          const actId = Number(newNotification.act_id);

          // 1. Додаємо ID в локальний сет для підсвітки
          modifiedActIdsGlobal.add(actId);

          // 2. Миттєво підсвічуємо рядок в DOM (синя ручка)
          highlightRowInDom(actId);

          // 3. 👇 ПОКАЗУЄМО КРАСИВЕ ПОВІДОМЛЕННЯ ВНИЗУ СПРАВА 👇
          showRealtimeActNotification({
            act_id: actId,
            notification_id: newNotification.notification_id,
            changed_by_surname: newNotification.changed_by_surname,
            item_name: newNotification.item_name,
            dodav_vudaluv: newNotification.dodav_vudaluv,
            created_at: newNotification.data || newNotification.created_at, // поле timestamp з БД
            pib: newNotification.pib,         // ✅ ПІБ клієнта
            auto: newNotification.auto,       // ✅ Автомобіль
          });
        }
      }
    )
    .subscribe();
}

/**
 * Знаходить рядок в таблиці і додає клас підсвітки (Синя ручка)
 */
function highlightRowInDom(actId: number) {
  const table = document.querySelector(
    "#table-container-modal-sakaz_narad table"
  );
  if (!table) return;

  const rows = table.querySelectorAll("tbody tr");
  rows.forEach((row) => {
    const firstCell = row.querySelector("td");
    if (firstCell) {
      const cellText = firstCell.textContent || "";
      const cellActId = parseInt(cellText.replace(/\D/g, ""));

      if (cellActId === actId) {
        row.classList.add("act-modified-blue-pen");
      }
    }
  });
}

/**
 * 3. Очищає ВІЗУАЛЬНУ підсвітку в таблиці та повідомлення в UI, АЛЕ НЕ ВИДАЛЯЄ З БАЗИ.
 */
function clearNotificationVisualOnly(actId: number) {
  if (userAccessLevel !== "Адміністратор") return;

  if (modifiedActIdsGlobal.has(actId)) {
    modifiedActIdsGlobal.delete(actId);

    const table = document.querySelector(
      "#table-container-modal-sakaz_narad table"
    );
    if (table) {
      const rows = table.querySelectorAll("tbody tr");
      rows.forEach((row) => {
        const firstCell = row.querySelector("td");
        if (firstCell) {
          const cellText = firstCell.textContent || "";
          const cellActId = parseInt(cellText.replace(/\D/g, ""));
          if (cellActId === actId) {
            row.classList.remove("act-modified-blue-pen");
          }
        }
      });
    }

    // Також видаляємо повідомлення з UI
    removeNotificationsForAct(actId);
  }
}

// =============================================================================
// ОБРОБКА ДАНИХ АКТІВ
// =============================================================================

function getClientInfo(
  act: any,
  clients: any[]
): { pib: string; phone: string } {
  const client = clients?.find((c) => c.client_id === act.client_id);
  const clientData = safeParseJSON(client?.data);
  const pib = clientData?.["ПІБ"] || "Невідомо";
  let phone = clientData?.["Телефон"] || "";
  phone = phone.replace(/[\(\)\-\s]/g, "");
  return { pib, phone };
}

function getCarInfo(act: any, cars: any[]): { number: string; name: string } {
  const car = cars?.find((c) => c.cars_id === act.cars_id);
  const carData = safeParseJSON(car?.data);
  const number = carData?.["Номер авто"] || "";
  const name = carData?.["Авто"] || "";
  return { number, name };
}

function getActAmount(act: any): number {
  const actData = safeParseJSON(act.info || act.data || act.details);
  const rawAmount =
    actData?.["Загальна сума"] ||
    actData?.["total"] ||
    actData?.["amount"] ||
    act.total ||
    act.amount;
  const num = Number(rawAmount);
  return isNaN(num) ? 0 : num;
}

function getActDateAsDate(act: any): Date | null {
  if (!act.date_on) return null;
  return new Date(act.date_on);
}

function isActClosed(act: any): boolean {
  return act.date_off && !isNaN(Date.parse(act.date_off));
}

// =============================================================================
// РЕНДЕРИНГ ТАБЛИЦІ (СТВОРЕННЯ КОМІРОК)
// =============================================================================

function createClientCell(
  clientInfo: { pib: string; phone: string },
  actId: number
): HTMLTableCellElement {
  const td = document.createElement("td");
  const phones = clientInfo.phone ? [clientInfo.phone] : [];
  let pibOnly = clientInfo.pib;
  td.innerHTML = `<div>${pibOnly}</div>`;
  phones.forEach((p) => {
    td.innerHTML += `<div class="phone-blue-italic">${p}</div>`;
  });

  td.addEventListener("click", async () => {
    const canOpen = await canUserOpenActs();
    if (canOpen) {
      clearNotificationVisualOnly(actId);
      showModal(actId);
    } else {
      showNoAccessNotification();
    }
  });

  return td;
}

function createCarCell(
  carInfo: { number: string; name: string },
  actId: number
): HTMLTableCellElement {
  const td = document.createElement("td");
  td.innerHTML = `<div style="word-wrap: break-word; word-break: break-word; white-space: normal;">${carInfo.name}</div>`;
  if (carInfo.number) {
    td.innerHTML += `<div style="color: #ff8800; font-size: 0.9em; word-wrap: break-word; word-break: break-word; white-space: normal;">${carInfo.number}</div>`;
  }

  td.addEventListener("dblclick", async () => {
    const canOpen = await canUserOpenActs();
    if (canOpen) {
      clearNotificationVisualOnly(actId);
      showModal(actId);
    } else {
      showNoAccessNotification();
    }
  });

  return td;
}

function createDateCell(act: any, actId: number): HTMLTableCellElement {
  const td = document.createElement("td");
  const actDate = getActDateAsDate(act);
  if (actDate) {
    const { date, time } = formatDateTime(actDate);
    td.innerHTML = `<div>${date}</div><div style="color: #0400ffff; font-size: 0.85em;">${time}</div>`;
  } else {
    td.innerHTML = `<div>-</div>`;
  }

  td.addEventListener("dblclick", async () => {
    const canOpen = await canUserOpenActs();
    if (canOpen) {
      clearNotificationVisualOnly(actId);
      showModal(actId);
    } else {
      showNoAccessNotification();
    }
  });

  return td;
}

function createStandardCell(
  content: string,
  act: any,
  actId: number,
  isActNumberCell: boolean = false
): HTMLTableCellElement {
  const td = document.createElement("td");
  td.classList.add("act-table-cell");

  if (isActNumberCell) {
    // 1. ЗВЕРХУ: ОУ-123 / 01.12.24 малим темно-помаранчевим
    if (act.contragent_act && act.contragent_act_data) {
      const actNum = act.contragent_act;
      const actDateFormatted = convertISOtoShortDate(act.contragent_act_data);

      if (actDateFormatted) {
        const actLabel = document.createElement("div");
        actLabel.classList.add("act-label-small");
        actLabel.textContent = `ОУ-${actNum} / ${actDateFormatted}`;
        td.appendChild(actLabel);
      }
    }

    // 2. ПОСЕРЕДИНІ: 🗝️ 1234 нормальним розміром
    const mainNumber = document.createElement("div");
    mainNumber.innerHTML = content;
    td.appendChild(mainNumber);

    // 3. ЗНИЗУ: СФ-123 / 15.12.24 малим темно-помаранчевим
    if (act.contragent_raxunok && act.contragent_raxunok_data) {
      const raxunokNum = act.contragent_raxunok;
      const raxunokDateFormatted = convertISOtoShortDate(
        act.contragent_raxunok_data
      );

      if (raxunokDateFormatted) {
        const raxunokLabel = document.createElement("div");
        raxunokLabel.classList.add("raxunok-label-small");
        raxunokLabel.textContent = `СФ-${raxunokNum} / ${raxunokDateFormatted}`;
        td.appendChild(raxunokLabel);
      }
    }
  } else {
    td.innerHTML = content;
  }

  td.addEventListener("dblclick", async () => {
    const canOpen = await canUserOpenActs();
    if (canOpen) {
      clearNotificationVisualOnly(actId);
      showModal(actId);
    } else {
      showNoAccessNotification();
    }
  });

  return td;
}

function showNoAccessNotification(): void {
  const notification = document.createElement("div");
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #ff5722;
    color: white;
    padding: 15px 25px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10001;
    font-size: 16px;
    animation: slideIn 0.3s ease;
  `;
  notification.textContent = "🔒 У вас немає доступу до перегляду актів";
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 3000);
}

// =============================================================================
// РЕНДЕРИНГ РЯДКІВ
// =============================================================================

function renderActsRows(
  acts: any[],
  clients: any[],
  cars: any[],
  tbody: HTMLTableSectionElement,
  accessLevel: string | null,
  modifiedActIds: Set<number>
): void {
  tbody.innerHTML = "";

  acts.forEach((act) => {
    const isClosed = isActClosed(act);
    const lockIcon = isClosed ? "🔒" : "🗝️";
    const clientInfo = getClientInfo(act, clients);
    const carInfo = getCarInfo(act, cars);
    const row = document.createElement("tr");

    row.classList.add(isClosed ? "row-closed" : "row-open");

    // ПЕРЕВІРКА ПІДСВІТКИ (СИНЯ РУЧКА)
    if (act.act_id && modifiedActIds.has(Number(act.act_id))) {
      row.classList.add("act-modified-blue-pen");
    }

    // Комірка № акту
    row.appendChild(
      createStandardCell(
        `${lockIcon} ${act.act_id?.toString() || "N/A"}`,
        act,
        act.act_id,
        true
      )
    );
    row.appendChild(createDateCell(act, act.act_id));
    row.appendChild(createClientCell(clientInfo, act.act_id));
    row.appendChild(createCarCell(carInfo, act.act_id));

    if (accessLevel !== "Слюсар") {
      row.appendChild(
        createStandardCell(
          `${getActAmount(act).toLocaleString("uk-UA")} грн`,
          act,
          act.act_id,
          false
        )
      );
    }

    tbody.appendChild(row);
  });
}

// =============================================================================
// СОРТУВАННЯ ТА ФІЛЬТРАЦІЯ
// =============================================================================

function sortActs(): void {
  if (sortByDateStep === 0) {
    actsGlobal.sort((a, b) => {
      const aOpen = !isActClosed(a);
      const bOpen = !isActClosed(b);
      if (aOpen && !bOpen) return -1;
      if (!aOpen && bOpen) return 1;
      return 0;
    });
    sortByDateStep = 1;
  } else {
    actsGlobal.sort(
      (a, b) =>
        (getActDateAsDate(b)?.getTime() || 0) -
        (getActDateAsDate(a)?.getTime() || 0)
    );
    sortByDateStep = 0;
  }
}

function getDefaultDateRange(): string {
  const today = new Date();
  const lastMonth = new Date(
    today.getFullYear(),
    today.getMonth() - 1,
    today.getDate()
  );
  return `${formatDate(lastMonth)} - ${formatDate(today)}`;
}

function getDateRange(): { dateFrom: string; dateTo: string } | null {
  const input = document.getElementById("dateRangePicker") as HTMLInputElement;
  const dateRangeValue = input?.value?.trim();
  if (!dateRangeValue) {
    input.value = getDefaultDateRange();
  }
  const currentValue = input.value.trim();
  if (currentValue === "Відкриті" || currentValue === "Закриті") return null;
  if (!currentValue.includes(" - ")) return null;

  const [startStr, endStr] = currentValue.split(" - ");
  if (!validateDateFormat(startStr) || !validateDateFormat(endStr)) return null;

  try {
    const [dateFrom, dateTo] = [startStr, endStr].map((str, i) => {
      const [d, m, y] = str.split(".");
      const full = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      return i === 0 ? `${full} 00:00:00` : `${full} 23:59:59`;
    });
    return { dateFrom, dateTo };
  } catch {
    return null;
  }
}

function filterActs(
  acts: any[],
  searchTerm: string,
  clients: any[],
  cars: any[]
): any[] {
  if (!searchTerm) return acts;
  const filters = parseSearchTerm(searchTerm);

  return acts.filter((act) => {
    const clientInfo = getClientInfo(act, clients);
    const carInfo = getCarInfo(act, cars);
    const actDate = getActDateAsDate(act);
    const formattedDate = actDate ? formatDate(actDate) : "";
    const amount = getActAmount(act);
    const raxunokNum = act.contragent_raxunok || "";
    const actNum = act.contragent_act || "";

    return filters.every((filter) => {
      const searchValue = filter.value.toUpperCase();
      if (searchValue.startsWith("СФ-")) {
        const numPart = searchValue.replace("СФ-", "").trim();
        return !numPart ? raxunokNum : raxunokNum.toString().includes(numPart);
      }
      if (searchValue.startsWith("ОУ-")) {
        const numPart = searchValue.replace("ОУ-", "").trim();
        return !numPart ? actNum : actNum.toString().includes(numPart);
      }
      switch (filter.key.toLowerCase()) {
        case "акт":
          return act.act_id?.toString().includes(filter.value);
        case "сума":
          return amount >= parseFloat(filter.value);
        case "дата":
          return formattedDate.includes(filter.value);
        case "тел":
        case "телефон":
          return clientInfo.phone.includes(filter.value);
        case "піб":
          return clientInfo.pib
            .toLowerCase()
            .includes(filter.value.toLowerCase());
        case "машина":
          return carInfo.name
            .toLowerCase()
            .includes(filter.value.toLowerCase());
        case "номер":
          return carInfo.number.includes(filter.value);
        default:
          return (
            clientInfo.pib.toLowerCase().includes(filter.value.toLowerCase()) ||
            clientInfo.phone.includes(filter.value) ||
            carInfo.number.includes(filter.value) ||
            carInfo.name.toLowerCase().includes(filter.value.toLowerCase()) ||
            act.act_id?.toString().includes(filter.value) ||
            formattedDate.includes(filter.value) ||
            amount.toString().includes(filter.value) ||
            raxunokNum.toString().includes(filter.value) ||
            actNum.toString().includes(filter.value)
          );
      }
    });
  });
}

function parseSearchTerm(searchTerm: string): { key: string; value: string }[] {
  const filters: { key: string; value: string }[] = [];
  const parts = searchTerm.split(" ").filter((p) => p);
  parts.forEach((part) => {
    const [key, value] = part.split(":");
    if (key && value) filters.push({ key, value });
    else filters.push({ key: "", value: part });
  });
  return filters;
}

// =============================================================================
// ЗАВАНТАЖЕННЯ ДАНИХ
// =============================================================================

async function loadActsFromDB(
  dateFrom: string | null,
  dateTo: string | null,
  filterType: "open" | "closed" | null = null
): Promise<any[] | null> {
  let query = supabase.from("acts").select("*");
  if (filterType === "open") query = query.is("date_off", null);
  else if (filterType === "closed") query = query.not("date_off", "is", null);
  else if (dateFrom && dateTo)
    query = query.gte("date_on", dateFrom).lte("date_on", dateTo);
  else {
    const fallbackDates = getDateRange();
    if (fallbackDates)
      query = supabase
        .from("acts")
        .select("*")
        .gte("date_on", fallbackDates.dateFrom)
        .lte("date_on", fallbackDates.dateTo);
    else return [];
  }
  query = query.order("act_id", { ascending: false });
  const { data: acts, error: actsError } = await query;
  if (actsError) {
    console.error("❌ Помилка при отриманні актів:", actsError);
    return null;
  }
  return acts || [];
}

async function loadClientsFromDB(): Promise<any[] | null> {
  const { data: clients, error: clientError } = await supabase
    .from("clients")
    .select("client_id, data");
  return clientError ? null : clients || [];
}

async function loadCarsFromDB(): Promise<any[] | null> {
  const { data: cars, error: carsError } = await supabase
    .from("cars")
    .select("cars_id, data");
  return carsError ? null : cars || [];
}

// =============================================================================
// СТВОРЕННЯ ТАБЛИЦІ
// =============================================================================

function createTableHeader(
  accessLevel: string | null
): HTMLTableSectionElement {
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  const headers = ["№ акту", "Дата", "Клієнт 🔽", "Автомобіль"];
  if (accessLevel !== "Слюсар") headers.push("Сумма");
  headers.forEach((header) => {
    const th = document.createElement("th");
    th.textContent = header;
    if (header.includes("Клієнт")) {
      th.addEventListener("click", () => {
        sortActs();
        updateTableBody();
      });
    }
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  return thead;
}

function updateTableBody(): void {
  const table = document.querySelector(
    "#table-container-modal-sakaz_narad table"
  );
  if (!table) return;
  const newTbody = document.createElement("tbody");
  renderActsRows(
    actsGlobal,
    clientsGlobal,
    carsGlobal,
    newTbody,
    userAccessLevel,
    modifiedActIdsGlobal
  );
  const oldTbody = table.querySelector("tbody");
  if (oldTbody) oldTbody.replaceWith(newTbody);

}

function createTable(accessLevel: string | null): HTMLTableElement {
  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";
  const thead = createTableHeader(accessLevel);
  const tbody = document.createElement("tbody");
  renderActsRows(
    actsGlobal,
    clientsGlobal,
    carsGlobal,
    tbody,
    accessLevel,
    modifiedActIdsGlobal
  );
  table.appendChild(thead);
  table.appendChild(tbody);
  return table;
}

function showNoDataMessage(message: string): void {
  const container = document.getElementById(
    "table-container-modal-sakaz_narad"
  );
  if (container)
    container.innerHTML = `<div style="text-align: center; padding: 20px; color: #666;">${message}</div>`;
}

function showAuthRequiredMessage(): void {
  const container = document.getElementById(
    "table-container-modal-sakaz_narad"
  );
  if (container) {
    container.innerHTML = `<div style="text-align: center; padding: 40px; color: #666;">
      <div style="font-size: 48px; margin-bottom: 20px;">🔐</div>
      <h3>Доступ обмежено</h3>
      <p>Для перегляду таблиці актів потрібна автентифікація</p>
      <button id="authRetryBtn" style="background: #4CAF50; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-size: 16px; margin-top: 15px;">Увійти</button>
    </div>`;
    const retryBtn = document.getElementById("authRetryBtn");
    if (retryBtn)
      retryBtn.addEventListener("click", () => initializeActsSystem());
  }
}

function showNoViewAccessMessage(): void {
  const container = document.getElementById(
    "table-container-modal-sakaz_narad"
  );
  if (container) {
    container.innerHTML = `<div style="text-align: center; padding: 40px; color: #666;">
      <div style="font-size: 48px; margin-bottom: 20px;">🚫</div>
      <h3>Доступ заборонено</h3>
      <p>У вас немає прав на перегляд актів</p>
    </div>`;
  }
}

// Функція applyVerticalScrollbarCompensation видалена, оскільки вирівнювання тепер контролюється CSS (sticky header)

// =============================================================================
// ОСНОВНІ ФУНКЦІОНАЛЬНІ
// =============================================================================

export async function loadActsTable(
  dateFrom: string | null = null,
  dateTo: string | null = null,
  filterType: "open" | "closed" | null = null,
  searchTerm: string | null = null
): Promise<void> {
  if (!isUserAuthenticated()) {
    const accessLevel = await showLoginModalBeforeTable();
    if (!accessLevel) {
      showAuthRequiredMessage();
      return;
    }
  }

  const canView = await canUserViewActs();
  if (!canView) {
    showNoViewAccessMessage();
    return;
  }

  try {
    let finalDateFrom: string | null = null;
    let finalDateTo: string | null = null;
    let finalFilterType: "open" | "closed" | null = filterType || null;
    const dateRangePicker = document.getElementById(
      "dateRangePicker"
    ) as HTMLInputElement;

    if (finalFilterType === "open" || finalFilterType === "closed") {
      finalDateFrom = null;
      finalDateTo = null;
    } else {
      if (dateFrom && dateTo) {
        finalDateFrom = dateFrom;
        finalDateTo = dateTo;
      } else {
        const fallback = getDateRange();
        if (fallback) {
          finalDateFrom = fallback.dateFrom;
          finalDateTo = fallback.dateTo;
        } else {
          const currentValue = dateRangePicker?.value?.trim();
          if (currentValue === "Відкриті") finalFilterType = "open";
          else if (currentValue === "Закриті") finalFilterType = "closed";
          else {
            const defaultRange = getDefaultDateRange();
            const [startStr, endStr] = defaultRange.split(" - ");
            const [d1, m1, y1] = startStr.split(".");
            const [d2, m2, y2] = endStr.split(".");
            finalDateFrom = `${y1}-${m1.padStart(2, "0")}-${d1.padStart(
              2,
              "0"
            )} 00:00:00`;
            finalDateTo = `${y2}-${m2.padStart(2, "0")}-${d2.padStart(
              2,
              "0"
            )} 23:59:59`;
            if (dateRangePicker) dateRangePicker.value = defaultRange;
          }
        }
      }
    }

    // ✅ Завантажуємо акти, клієнтів, машини + СПОВІЩЕННЯ
    const [acts, clients, cars, modifiedIds] = await Promise.all([
      loadActsFromDB(finalDateFrom, finalDateTo, finalFilterType),
      loadClientsFromDB(),
      loadCarsFromDB(),
      fetchModifiedActIds(), // <-- Завантажуємо існуючі підсвітки
    ]);

    if (acts === null || clients === null || cars === null) return;

    clientsGlobal = clients;
    carsGlobal = cars;
    modifiedActIdsGlobal = modifiedIds; // Зберігаємо глобально

    actsGlobal = filterActs(acts, searchTerm ?? "", clients, cars);

    if (actsGlobal.length === 0) {
      showNoDataMessage("Немає актів у вказаному діапазоні.");
      return;
    }

    const table = createTable(userAccessLevel);
    const container = document.getElementById(
      "table-container-modal-sakaz_narad"
    );
    if (!container) return;
    container.innerHTML = "";
    container.appendChild(table);

  } catch (error) {
    console.error("💥 Критична помилка:", error);
  }
}

export async function refreshActsTable(): Promise<void> {
  if (!isUserAuthenticated()) return;
  const searchInput = document.getElementById(
    "searchInput"
  ) as HTMLInputElement;
  const currentSearchTerm = searchInput?.value?.trim() || "";
  const dateRangePicker = document.getElementById(
    "dateRangePicker"
  ) as HTMLInputElement;
  const currentValue = dateRangePicker?.value?.trim() || "";

  let currentFilterType: "open" | "closed" | null = null;
  let currentDateFrom: string | null = null;
  let currentDateTo: string | null = null;

  if (currentValue === "Відкриті") currentFilterType = "open";
  else if (currentValue === "Закриті") currentFilterType = "closed";
  else {
    const dates = getDateRange();
    if (dates) {
      currentDateFrom = dates.dateFrom;
      currentDateTo = dates.dateTo;
    }
  }
  loadActsTable(
    currentDateFrom,
    currentDateTo,
    currentFilterType,
    currentSearchTerm
  );
}

function watchDateRangeChanges(): void {
  const dateRangePicker = document.getElementById(
    "dateRangePicker"
  ) as HTMLInputElement;
  if (!dateRangePicker) return;
  let lastValue = dateRangePicker.value;
  const observer = new MutationObserver(() => {
    const currentValue = dateRangePicker.value;
    if (currentValue !== lastValue) {
      lastValue = currentValue;
      const searchInput = document.getElementById(
        "searchInput"
      ) as HTMLInputElement;
      const currentSearchTerm = searchInput?.value?.trim() || "";
      loadActsTable(undefined, undefined, undefined, currentSearchTerm);
    }
  });
  observer.observe(dateRangePicker, {
    attributes: true,
    childList: true,
    characterData: true,
    subtree: true,
  });
  window.addEventListener("beforeunload", () => observer.disconnect());
}

export async function initializeActsSystem(): Promise<void> {
  console.log("Ініціалізація системи актів...");
  try {
    const accessLevel = await showLoginModalBeforeTable();
    if (!accessLevel) {
      showAuthRequiredMessage();
      return;
    }
    const canView = await canUserViewActs();
    if (!canView) {
      showNoViewAccessMessage();
      return;
    }

    await loadActsTable(null, null, "open");

    // ✅ АКТИВУЄМО REALTIME ПІДПИСКУ
    subscribeToActNotifications();

    // 📥 ЗАВАНТАЖУЄМО ІСНУЮЧІ ПОВІДОМЛЕННЯ З БД
    console.log(`🔍 [initializeActsSystem] accessLevel = "${accessLevel}"`);
    if (accessLevel === "Адміністратор") {
      console.log("📥 [initializeActsSystem] Викликаємо loadAndShowExistingNotifications...");
      await loadAndShowExistingNotifications();
      console.log("✅ [initializeActsSystem] loadAndShowExistingNotifications завершено");
    } else {
      console.log(`⏭️ [initializeActsSystem] Пропускаємо loadAndShowExistingNotifications (accessLevel = "${accessLevel}")`);
    }

    watchDateRangeChanges();

    console.log("✅ Система ініціалізована.");
  } catch (error) {
    console.error("💥 Помилка ініціалізації:", error);
    showNoDataMessage("❌ Помилка");
  }
}

export { logoutFromSystemAndRedirect, isUserAuthenticated } from "./users";
