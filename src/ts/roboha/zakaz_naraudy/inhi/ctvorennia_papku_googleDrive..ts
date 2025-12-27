// src\ts\roboha\zakaz_naraudy\inhi\ctvorennia_papku_googleDrive..ts

import { supabase } from "../../../vxid/supabaseClient";
import { showNotification } from "./vspluvauhe_povidomlenna";

// ------- Глобальні декларації -------
declare let gapi: any;
declare let google: any;

// ------- Константи -------
const CLIENT_ID =
  "671438162736-hc3d9rc6lbpumdppteluicumav8khp8t.apps.googleusercontent.com";
const SCOPES = "https://www.googleapis.com/auth/drive.file";

const ALLOWED_ORIGINS = [
  "https://shlifservice24-lang.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
];

// ------- Стан аутентифікації -------
let accessToken: string | null = null;

// 🚫 Блокування повторних кліків під час створення
let isCreatingFolder = false;

// ================= УТИЛІТИ =================

function handleError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === "string") return new Error(error);
  return new Error("Невідома помилка");
}

function isAllowedOrigin(): boolean {
  return ALLOWED_ORIGINS.includes(window.location.origin);
}

// Безпечний JSON.parse
export function safeParseJSON(data: any): any {
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
  return data;
}

// Очистка частин назви для папок
function cleanNameComponent(component: string): string {
  return component
    .replace(/[^\p{L}\p{N}\s.-]/gu, "")
    .replace(/\s+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_|_$/g, "");
}

// Затримка для retry логіки
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Детекція iOS
function isIOS(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// ================= ЗАВАНТАЖЕННЯ API =================

async function loadGoogleAPIs(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof google !== "undefined" && typeof gapi !== "undefined") {
      resolve();
      return;
    }

    const gisScript = document.createElement("script");
    gisScript.src = "https://accounts.google.com/gsi/client";
    gisScript.async = true;
    gisScript.defer = true;

    gisScript.onload = () => {
      const gapiScript = document.createElement("script");
      gapiScript.src = "https://apis.google.com/js/api.js";
      gapiScript.async = true;
      gapiScript.defer = true;

      gapiScript.onload = () => resolve();
      gapiScript.onerror = () =>
        reject(new Error("Не вдалося завантажити GAPI"));
      document.head.appendChild(gapiScript);
    };

    gisScript.onerror = () =>
      reject(new Error("Не вдалося завантажити Google Identity Services"));

    document.head.appendChild(gisScript);
  });
}

export async function initGoogleApi(): Promise<void> {
  try {
    console.log("🔐 [iOS Debug] Початок ініціалізації Google API");
    console.log("🔐 [iOS Debug] User Agent:", navigator.userAgent);
    console.log("🔐 [iOS Debug] Origin:", window.location.origin);

    if (!isAllowedOrigin()) {
      throw new Error(`Домен ${window.location.origin} не дозволено.`);
    }

    console.log("🔐 [iOS Debug] Завантаження Google API скриптів...");
    await loadGoogleAPIs();
    console.log("✅ [iOS Debug] Google API скрипти завантажені");

    console.log("🔐 [iOS Debug] Ініціалізація GAPI client...");
    await new Promise<void>((resolve, reject) => {
      gapi.load("client", {
        callback: () => {
          console.log("✅ [iOS Debug] GAPI client завантажений");
          resolve();
        },
        onerror: () => {
          console.error("❌ [iOS Debug] Помилка завантаження GAPI");
          reject(new Error("Помилка завантаження GAPI"));
        },
      });
    });

    console.log("🔐 [iOS Debug] Запит OAuth токену...");
    await new Promise<void>((resolve, reject) => {
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: async (response: any) => {
          console.log("🔐 [iOS Debug] OAuth callback отримано:", response);

          if (response.error || !response.access_token) {
            console.error("❌ [iOS Debug] Помилка OAuth:", response.error);
            reject(new Error(response.error || "Не отримано токен доступу"));
            return;
          }

          console.log("✅ [iOS Debug] Токен отримано");
          console.log("🔍 [Debug] Token scope:", response.scope);
          console.log(
            "🔍 [Debug] Token expires in:",
            response.expires_in,
            "seconds"
          );
          accessToken = response.access_token;
          gapi.client.setToken(response);

          try {
            console.log("🔐 [iOS Debug] Ініціалізація Drive API...");
            await gapi.client.init({});

            console.log("🔐 [iOS Debug] Завантаження Drive v3...");
            await gapi.client.load("drive", "v3");

            console.log("🔐 [iOS Debug] Тест підключення до Drive...");
            await testDriveConnection();

            console.log("✅ [iOS Debug] Google API повністю ініціалізовано");
            resolve();
          } catch (err) {
            console.error("❌ [iOS Debug] Помилка ініціалізації Drive:", err);
            reject(handleError(err));
          }
        },
        error_callback: (err: any) => {
          console.error("❌ [iOS Debug] OAuth error callback:", err);
          reject(handleError(err));
        },
      });

      console.log("🔐 [iOS Debug] Відкриття OAuth popup...");
      tokenClient.requestAccessToken();
    });
  } catch (error) {
    console.error("❌ [iOS Debug] Критична помилка initGoogleApi:", error);
    throw handleError(error);
  }
}

// ================= DRIVE API =================

async function callDriveAPI(
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
  if (!accessToken) throw new Error("Немає токена доступу");

  const response = await fetch(
    `https://www.googleapis.com/drive/v3${endpoint}`,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("❌ Drive API Error Details:", errorBody);

    if (response.status === 403) {
      throw new Error(
        `Drive API 403: Доступ заборонено. Перевірте: \n` +
          `1. Drive API увімкнено в Google Cloud Console\n` +
          `2. OAuth scope правильний: ${SCOPES}\n` +
          `3. Email додано до Test Users (якщо в Testing mode)\n` +
          `Деталі: ${errorBody}`
      );
    }

    throw new Error(
      `Drive API Error: ${response.status} ${response.statusText} - ${errorBody}`
    );
  }

  return response.json();
}

// ✅ Пошук папки за appProperties.act_id (найнадійніший спосіб)
async function findFolderByActId(
  actId: number,
  parentId: string | null
): Promise<string | null> {
  const parent = parentId ?? "root";
  const query = `'${parent}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false and appProperties has { key='act_id' and value='${String(
    actId
  )}' }`;
  try {
    const list = await callDriveAPI(
      `/files?q=${encodeURIComponent(query)}&fields=files(id,name)`
    );
    return list.files?.[0]?.id || null;
  } catch (e) {
    console.warn("Помилка пошуку за appProperties:", e);
    return null;
  }
}

async function findFolder(
  name: string,
  parentId: string | null = null
): Promise<string | null> {
  try {
    const safeName = name.replace(/'/g, "\\'");
    const query =
      `'${parentId ?? "root"}' in parents and name = '${safeName}' and ` +
      `mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const list = await callDriveAPI(
      `/files?q=${encodeURIComponent(query)}&fields=files(id,name)`
    );
    return list.files?.[0]?.id || null;
  } catch (e) {
    console.error("Помилка пошуку папки:", e);
    return null;
  }
}

// ✅ Створення папки з appProperties (act_id)
async function createFolder(
  name: string,
  parentId: string | null = null,
  appProps?: Record<string, string>
): Promise<string> {
  const body: any = {
    name,
    mimeType: "application/vnd.google-apps.folder",
    ...(parentId ? { parents: [parentId] } : {}),
  };

  if (appProps && Object.keys(appProps).length) {
    body.appProperties = appProps;
  }

  try {
    const created = await callDriveAPI("/files?fields=id", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return created.id;
  } catch (e) {
    throw handleError(e);
  }
}

export async function findOrCreateFolder(
  name: string,
  parentId: string | null = null
): Promise<string> {
  const existingId = await findFolder(name, parentId);
  if (existingId) return existingId;
  return createFolder(name, parentId);
}

/**
 * 🔍 Шукає існуючу папку для акту і відновлює посилання в БД якщо знайдено
 * Використовується як fallback, коли папка створена, але шлях не записаний
 */
export async function findAndRestoreFolderLink(
  actId: number,
  actInfo: {
    date_on: string;
    fio: string;
    phone: string;
    car: string;
    year: string;
  }
): Promise<string | null> {
  try {
    console.log(`🔍 Пошук існуючої папки для акту ${actId}...`);

    const date = new Date(actInfo.date_on);
    const yyyy = String(date.getFullYear());

    // 1) Шукаємо папку року
    const yearFolderId = await findFolder(yyyy);
    if (!yearFolderId) {
      console.log("❌ Папку року не знайдено");
      return null;
    }

    // 2) Шукаємо папку акту за appProperties.act_id
    let actFolderId = await findFolderByActId(actId, yearFolderId);

    // 3) Якщо не знайшли — шукаємо за назвою
    if (!actFolderId) {
      const parts = [
        `Акт_${actId}`,
        actInfo.fio && actInfo.fio !== "—" && actInfo.fio !== "Невідомий_клієнт"
          ? cleanNameComponent(actInfo.fio)
          : null,
        actInfo.car && actInfo.car !== "—" && actInfo.car !== "Невідоме_авто"
          ? cleanNameComponent(actInfo.car)
          : null,
        actInfo.year && actInfo.year !== "—" && actInfo.year !== "0000"
          ? cleanNameComponent(actInfo.year)
          : null,
        actInfo.phone &&
        actInfo.phone !== "—" &&
        actInfo.phone !== "Без_телефону"
          ? cleanNameComponent(actInfo.phone)
          : null,
      ].filter(Boolean) as string[];

      const folderName = parts.join("_").slice(0, 100);
      actFolderId = await findFolder(folderName, yearFolderId);
    }

    if (!actFolderId) {
      console.log("❌ Папку акту не знайдено");
      return null;
    }

    // 4) Знайдено! Записуємо в БД
    const driveUrl = `https://drive.google.com/drive/folders/${actFolderId}`;
    console.log(`✅ Знайдено існуючу папку: ${driveUrl}`);

    await updateActPhotoLinkWithRetry(actId, driveUrl);

    return driveUrl;
  } catch (error) {
    console.error("Помилка пошуку існуючої папки:", error);
    return null;
  }
}

// ================= БАЗА ДАНИХ =================

async function getActFullInfo(actId: number): Promise<{
  act_id: number;
  date_on: string;
  fio: string;
  phone: string;
  car: string;
  year: string;
  act_data: any;
}> {
  try {
    const { data: act, error: actError } = await supabase
      .from("acts")
      .select("*")
      .eq("act_id", actId)
      .single();

    if (actError || !act)
      throw new Error(`Не вдалося знайти акт з ID ${actId}`);

    // Клієнт
    let clientInfo = { fio: "Невідомий_клієнт", phone: "Без_телефону" };
    if (act.client_id) {
      const { data: client } = await supabase
        .from("clients")
        .select("*")
        .eq("client_id", act.client_id)
        .single();

      if (client) {
        const clientData = client?.data?.data
          ? safeParseJSON(client.data.data)
          : safeParseJSON(client?.data) ?? client?.data ?? {};
        const fio =
          clientData?.["ПІБ"] ??
          clientData?.fio ??
          client?.data?.fio ??
          client?.fio ??
          "Невідомий_клієнт";
        const phone =
          clientData?.["Телефон"] ??
          clientData?.phone ??
          client?.data?.phone ??
          client?.phone ??
          "Без_телефону";

        clientInfo = {
          fio: String(fio || "").trim() || "Невідомий_клієнт",
          phone: String(phone || "").trim() || "Без_телефону",
        };
      }
    }

    // Авто
    let carInfo = { auto: "Невідоме_авто", year: "0000" };
    if (act.cars_id) {
      const { data: car } = await supabase
        .from("cars")
        .select("*")
        .eq("cars_id", act.cars_id)
        .single();

      if (car) {
        const carData = safeParseJSON(car.data) ?? car.data ?? {};
        const auto =
          carData?.["Авто"] ?? carData?.auto ?? car?.auto ?? "Невідоме_авто";
        const year = carData?.["Рік"] ?? carData?.year ?? car?.year ?? "0000";

        carInfo = {
          auto: String(auto || "").trim() || "Невідоме_авто",
          year: String(year || "").trim() || "0000",
        };
      }
    }

    return {
      act_id: actId,
      date_on: act.date_on,
      fio: clientInfo.fio,
      phone: clientInfo.phone,
      car: carInfo.auto,
      year: carInfo.year,
      act_data: act,
    };
  } catch (error) {
    console.error("Помилка отримання інформації про акт:", error);
    throw error;
  }
}

// ✅ Надійний апдейт з нормалізацією JSON та retry логікою
// 🔒 Захист від гонки умов при одночасному доступі з різних пристроїв
async function updateActPhotoLinkWithRetry(
  actId: number,
  driveUrl: string,
  maxRetries: number = 3
): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`📝 Спроба ${attempt}/${maxRetries} запису шляху в БД...`);

      const { data: currentAct, error: fetchError } = await supabase
        .from("acts")
        .select("data")
        .eq("act_id", actId)
        .single();

      if (fetchError || !currentAct) {
        throw new Error(`Не вдалося знайти акт з ID ${actId}`);
      }

      // НОРМАЛІЗАЦІЯ
      const parsed = safeParseJSON(currentAct.data);
      const actData: Record<string, any> =
        parsed && typeof parsed === "object" ? parsed : currentAct.data ?? {};

      // 🔒 Перевіряємо чи посилання вже є (захист від дублювання)
      const existingPhotos = Array.isArray(actData["Фото"])
        ? actData["Фото"]
        : [];

      if (existingPhotos.includes(driveUrl)) {
        console.log("ℹ️ Посилання вже існує в БД, пропускаємо оновлення");
        updatePhotoSection(existingPhotos, false);
        return; // ✅ Вже є, нічого не робимо
      }

      // Додаємо нове посилання БЕЗ дублікатів
      const uniquePhotos = [driveUrl, ...existingPhotos.filter(Boolean)];
      actData["Фото"] = [...new Set(uniquePhotos)]; // Унікальні значення

      console.log(`💾 Записуємо в БД:`, actData["Фото"]);

      const { data: updatedRow, error: updateError } = await supabase
        .from("acts")
        .update({ data: actData })
        .eq("act_id", actId)
        .select("data")
        .single();

      if (updateError) {
        throw new Error(`Не вдалося оновити акт: ${updateError.message}`);
      }

      // ✅ Перевіряємо, що дані справді записалися
      const savedLinks: string[] = Array.isArray(updatedRow?.data?.["Фото"])
        ? updatedRow.data["Фото"]
        : [];

      if (!savedLinks.includes(driveUrl)) {
        throw new Error("Посилання не збереглося в БД після оновлення");
      }

      console.log("✅ Шлях успішно записаний в БД:", savedLinks);

      // Локально перемикаємо UI в режим "відкрити"
      updatePhotoSection(savedLinks, false);

      // Із БД підтягнемо ще раз, щоб синхронізувати стан (на всякий випадок)
      setTimeout(() => refreshPhotoData(actId), 500);

      return; // ✅ Успіх!
    } catch (error) {
      lastError = handleError(error);
      console.error(`❌ Спроба ${attempt} невдала:`, lastError.message);

      if (attempt < maxRetries) {
        console.log(`⏳ Очікування 2 секунди перед наступною спробою...`);
        await sleep(2000); // Збільшено затримку для уникнення конфліктів
      }
    }
  }

  // Якщо всі спроби невдалі
  throw new Error(
    `Не вдалося записати шлях після ${maxRetries} спроб: ${lastError?.message}`
  );
}

// ================= МОДАЛЬНЕ ВІКНО: "ФОТО" =================

/**
 * Малює текст у комірці (зелений — відкрити, червоний — створити)
 * і робить КЛІК ПО ВСІЙ КОМІРЦІ. Ніяких window.open тут — тільки рендер.
 */
export function updatePhotoSection(
  photoLinks: string[],
  isActClosed = false
): void {
  const photoCell = document.querySelector(
    "table.zakaz_narayd-table.left tr:nth-child(5) td:nth-child(2)"
  ) as HTMLTableCellElement | null;

  if (!photoCell) return;

  const hasLink =
    Array.isArray(photoLinks) && photoLinks.length > 0 && !!photoLinks[0];

  photoCell.innerHTML = hasLink
    ? `<span style="color:green; text-decoration: underline;">Відкрити архів фото</span>`
    : `<span style="color:red; text-decoration: underline;">Створити фото</span>`;

  photoCell.style.cursor = isActClosed && !hasLink ? "not-allowed" : "pointer";
  photoCell.setAttribute("aria-role", "button");

  addGoogleDriveHandler(isActClosed);
}

/**
 * Клік по ВСІЙ комірці:
 * - якщо в БД є посилання — відкриваємо його
 * - якщо немає — створюємо папку, записуємо URL у БД, оновлюємо UI (без дублювання)
 */
export function addGoogleDriveHandler(isActClosed = false): void {
  const photoCell = document.querySelector(
    "table.zakaz_narayd-table.left tr:nth-child(5) td:nth-child(2)"
  ) as HTMLTableCellElement | null;
  if (!photoCell) return;

  // знімаємо попередній слухач, якщо був
  (photoCell as any).__gd_click__ &&
    photoCell.removeEventListener("click", (photoCell as any).__gd_click__);

  const onClick = async (e: MouseEvent) => {
    e.preventDefault();

    if (isCreatingFolder) return; // 🚫 захист від мульти-кліків

    const modal = document.getElementById("zakaz_narayd-custom-modal");
    const actIdStr = modal?.getAttribute("data-act-id");
    if (!actIdStr) return;
    const actId = Number(actIdStr);

    try {
      // тягнемо АКТ із БД — беремо ЛИШЕ актуальний стан
      const { data: act, error } = await supabase
        .from("acts")
        .select("data, date_off")
        .eq("act_id", actId)
        .single();

      if (error || !act) {
        showNotification("Помилка отримання даних акту", "error");
        return;
      }

      const actData = safeParseJSON(act.data) || {};
      const links: string[] = Array.isArray(actData?.["Фото"])
        ? actData["Фото"]
        : [];
      const hasLink = links.length > 0 && links[0];

      // Якщо посилання вже є — відкриваємо його
      if (hasLink) {
        console.log("📂 [iOS Debug] Відкриваємо існуючу папку:", links[0]);

        // 🍎 Для iOS використовуємо прямий редірект (більш надійно)
        if (isIOS()) {
          console.log(
            "📱 [iOS] Використовуємо window.location.href для переходу"
          );

          // Показуємо повідомлення
          showNotification("Відкриваємо папку Google Drive...", "info");

          // Прямий перехід (найнадійніший метод для iOS)
          setTimeout(() => {
            window.location.href = links[0];
          }, 300);
        } else {
          // Для desktop - звичайне нове вікно
          console.log("💻 [Desktop] Відкриваємо в новому вікні");
          window.open(links[0], "_blank", "noopener,noreferrer");
        }
        return;
      }

      // Якщо акту «закритий» — створення заборонено
      if (isActClosed || !!act.date_off) {
        showNotification(
          "Акт закритий — створення папки заборонено",
          "warning"
        );
        return;
      }

      // 🔍 СПОЧАТКУ ШУКАЄМО ІСНУЮЧУ ПАПКУ (може бути створена, але не записана в БД)
      isCreatingFolder = true;
      photoCell.style.pointerEvents = "none";

      // ⚡️ КРИТИЧНО ДЛЯ iOS: Ініціалізуємо API ОДРАЗУ після кліку (до БД запитів)!
      // Safari блокує popup якщо між кліком і OAuth проходить >1сек
      console.log("📱 [iOS Debug] Перевірка авторизації Google API...");

      // Якщо токен відсутній - запитуємо НЕГАЙНО (поки клік свіжий)
      if (!accessToken) {
        console.log(
          "📱 [iOS Debug] Токен відсутній, запускаємо авторизацію ЗАРАЗ..."
        );
        showNotification(
          isIOS()
            ? "🔐 Авторизація Google (дозвольте popup)..."
            : "Ініціалізація Google API...",
          "info"
        );

        try {
          await initGoogleApi();
          console.log("✅ [iOS Debug] Google API авторизовано успішно");
        } catch (apiError) {
          console.error("❌ [iOS Debug] Помилка авторизації API:", apiError);
          showNotification(
            `❌ Помилка авторизації Google: ${
              apiError instanceof Error ? apiError.message : "Невідома помилка"
            }. ${
              isIOS()
                ? "\n💡 Підказка: Safari блокує popup-вікна. Увімкніть їх: Налаштування Safari → Popup-вікна → Дозволити для цього сайту"
                : ""
            }`,
            "error"
          );
          throw apiError;
        }
      } else {
        console.log("✅ [iOS Debug] Токен вже є, пропускаємо авторизацію");
      }

      // Тільки після авторизації робимо запити до БД
      console.log("📱 [iOS Debug] Отримання інформації про акт...");
      const actInfo = await getActFullInfo(actId);
      console.log("📱 [iOS Debug] Інформація про акт отримана:", actInfo);

      showNotification("Пошук існуючої папки в Google Drive...", "info");
      const existingUrl = await findAndRestoreFolderLink(actId, actInfo);

      if (existingUrl) {
        showNotification(
          "Знайдено існуючу папку! Посилання відновлено.",
          "success"
        );
        return;
      }

      // Якщо не знайдено — створюємо нову папку
      showNotification("Створення нової папки в Google Drive...", "info");
      await createDriveFolderStructure(actInfo);

      showNotification("Готово. Посилання додано у форму.", "success");
    } catch (err) {
      console.error("❌ Google Drive помилка:", err);

      let errorMessage = "Невідома помилка";
      if (err instanceof Error) {
        errorMessage = err.message;

        // Спеціальні підказки для типових помилок
        if (
          errorMessage.includes("popup") ||
          errorMessage.includes("blocked")
        ) {
          errorMessage +=
            " (iOS Safari блокує popup-вікна - перевірте налаштування)";
        } else if (
          errorMessage.includes("token") ||
          errorMessage.includes("auth")
        ) {
          errorMessage += " (Проблема з авторизацією Google)";
        } else if (
          errorMessage.includes("network") ||
          errorMessage.includes("failed to fetch")
        ) {
          errorMessage += " (Проблема з мережею)";
        }
      }

      showNotification(
        `Не вдалося створити/знайти папку: ${errorMessage}`,
        "error"
      );
    } finally {
      isCreatingFolder = false;
      photoCell.style.pointerEvents = "";
    }
  };

  (photoCell as any).__gd_click__ = onClick;
  photoCell.addEventListener("click", onClick);
}

/** Підтягує свіжі дані з БД і оновлює розмітку блоку “Фото”. */
export async function refreshPhotoData(actId: number): Promise<void> {
  try {
    console.log(`🔄 [Refresh] Оновлення даних фото для акту ${actId}...`);

    const { data: act, error } = await supabase
      .from("acts")
      .select("data, date_off")
      .eq("act_id", actId)
      .single();

    if (error || !act) {
      console.error("❌ [Refresh] Помилка при оновленні даних фото:", error);
      return;
    }

    const actData = safeParseJSON(act.data) || {};
    const photoLinks: string[] = Array.isArray(actData?.["Фото"])
      ? actData["Фото"].filter(Boolean) // Фільтруємо порожні значення
      : [];

    console.log(
      `📊 [Refresh] Знайдено ${photoLinks.length} посилань:`,
      photoLinks
    );

    const isActClosed = !!act.date_off;
    updatePhotoSection(photoLinks, isActClosed);

    console.log(
      `✅ [Refresh] UI оновлено, акт ${isActClosed ? "закритий" : "відкритий"}`
    );
  } catch (error) {
    console.error("❌ [Refresh] Критична помилка при оновленні фото:", error);
  }
}

// ================= ОСНОВНЕ: СТРУКТУРА ПАПОК =================

/**
 * Створює ієрархію папок:
 *  - Рік (yyyy) → Акт_{id}_{fio}_{car}_{year}_{phone}
 * Порядок: (1) знайти існуючу за appProperties.act_id; (2) якщо ні — знайти за назвою; (3) створити з appProperties; (4) записати URL у БД та оновити UI.
 */
export async function createDriveFolderStructure({
  act_id,
  date_on,
  fio,
  phone,
  car,
  year,
}: {
  act_id: number;
  date_on: string;
  fio: string;
  phone: string;
  car: string;
  year: string;
}): Promise<void> {
  try {
    const date = new Date(date_on);
    const yyyy = String(date.getFullYear());

    // 1) Папка року
    const yearFolderId = await findOrCreateFolder(yyyy);

    // 2) Спочатку шукаємо папку за appProperties.act_id
    let actFolderId = await findFolderByActId(act_id, yearFolderId);

    // 3) Якщо не знайшли — шукаємо за детермінованою назвою
    if (!actFolderId) {
      const parts = [
        `Акт_${act_id}`,
        fio && fio !== "—" && fio !== "Невідомий_клієнт"
          ? cleanNameComponent(fio)
          : null,
        car && car !== "—" && car !== "Невідоме_авто"
          ? cleanNameComponent(car)
          : null,
        year && year !== "—" && year !== "0000"
          ? cleanNameComponent(year)
          : null,
        phone && phone !== "—" && phone !== "Без_телефону"
          ? cleanNameComponent(phone)
          : null,
      ].filter(Boolean) as string[];

      const folderName = parts.join("_").slice(0, 100);
      actFolderId = await findFolder(folderName, yearFolderId);

      // 4) Якщо і за назвою немає — створюємо з appProperties
      if (!actFolderId) {
        actFolderId = await createFolder(folderName, yearFolderId, {
          act_id: String(act_id),
        });
      }
    }

    // 5) URL → БД → оновити UI
    const driveUrl = `https://drive.google.com/drive/folders/${actFolderId}`;

    console.log(`📍 Папка створена/знайдена: ${driveUrl}`);
    await updateActPhotoLinkWithRetry(act_id, driveUrl);

    console.log("✅ Структура папок успішно створена та записана в БД");
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : "Невідома помилка";
    console.error("❌ Помилка створення структури папок:", e);
    showNotification(`Не вдалося створити/знайти папку: ${errorMsg}`, "error");
    throw e; // Пробрасываем ошибку дальше
  }
}

// ================= АУТЕНТИФІКАЦІЯ / КОРИСНЕ =================

export function checkAuthStatus(): boolean {
  return accessToken !== null;
}

export async function signOut(): Promise<void> {
  try {
    if (accessToken && google?.accounts?.oauth2) {
      google.accounts.oauth2.revoke(accessToken);
    }
    accessToken = null;
    if (gapi?.client) gapi.client.setToken(null);
  } catch (e) {
    console.error("Помилка при виході:", e);
  }
}

export async function testDriveConnection(): Promise<void> {
  await callDriveAPI("/files?pageSize=1&fields=files(id,name)");
}

export async function getCurrentUser(): Promise<any> {
  const res = await callDriveAPI("/about?fields=user");
  return res.user;
}
