-- ============================================================================
-- SQL СКРИПТ ДЛЯ СИНХРОНІЗАЦІЇ ДАТ ЗАКРИТТЯ АКТІВ
-- ============================================================================
-- 
-- Цей скрипт оновлює поле "ДатаЗакриття" в JSON стовпці data таблиці slyusars
-- на основі даних з таблиці acts (поле date_off)
--
-- ІНСТРУКЦІЯ:
-- 1. Відкрийте Supabase Dashboard
-- 2. Перейдіть в SQL Editor
-- 3. Скопіюйте та вставте цей код
-- 4. Натисніть "Run" або Ctrl+Enter
--
-- ⚠️ ВАЖЛИВО: Зробіть резервну копію перед запуском!
--
-- ============================================================================

-- Функція для конвертації timestamp в дату формату YYYY-MM-DD
CREATE OR REPLACE FUNCTION to_iso_date_only(dt TIMESTAMP WITH TIME ZONE)
RETURNS TEXT AS $$
BEGIN
  IF dt IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN TO_CHAR(dt, 'YYYY-MM-DD');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- ОСНОВНИЙ ЗАПИТ ДЛЯ ОНОВЛЕННЯ
-- ============================================================================

DO $$
DECLARE
  slyusar_record RECORD;
  history_data JSONB;
  date_key TEXT;
  day_bucket JSONB;
  act_entry JSONB;
  act_index INTEGER;
  act_number TEXT;
  current_date_close TEXT;
  correct_date_close TEXT;
  updated_day_bucket JSONB;
  updated_history JSONB;
  total_users_processed INTEGER := 0;
  total_users_updated INTEGER := 0;
  total_acts_updated INTEGER := 0;
  user_acts_updated INTEGER;
BEGIN
  RAISE NOTICE '🚀 Початок синхронізації дат закриття актів...';
  RAISE NOTICE '============================================================';

  -- Проходимо по всіх записах в таблиці slyusars
  FOR slyusar_record IN 
    SELECT * FROM slyusars
  LOOP
    -- Перевіряємо наявність історії
    IF slyusar_record.data IS NULL OR 
       NOT (slyusar_record.data ? 'Історія') THEN
      RAISE NOTICE '⏭️ Пропускаємо % - немає історії', 
        COALESCE(slyusar_record.data->>'Name', 'Невідомий');
      CONTINUE;
    END IF;

    total_users_processed := total_users_processed + 1;
    user_acts_updated := 0;
    history_data := slyusar_record.data->'Історія';
    updated_history := history_data;

    -- Проходимо по всіх датах в історії
    FOR date_key IN 
      SELECT jsonb_object_keys(history_data)
    LOOP
      day_bucket := history_data->date_key;
      
      -- Перевіряємо що це масив
      IF jsonb_typeof(day_bucket) != 'array' THEN
        CONTINUE;
      END IF;

      updated_day_bucket := '[]'::jsonb;

      -- Проходимо по всіх актах за цю дату
      FOR act_index IN 0..(jsonb_array_length(day_bucket) - 1)
      LOOP
        act_entry := day_bucket->act_index;
        act_number := act_entry->>'Акт';

        IF act_number IS NULL THEN
          updated_day_bucket := updated_day_bucket || jsonb_build_array(act_entry);
          CONTINUE;
        END IF;

        current_date_close := act_entry->>'ДатаЗакриття';

        -- Отримуємо правильну дату закриття з таблиці acts
        SELECT to_iso_date_only(date_off)
        INTO correct_date_close
        FROM acts
        WHERE act_id::TEXT = act_number;

        -- Перевіряємо чи потрібно оновити
        IF correct_date_close IS DISTINCT FROM current_date_close THEN
          RAISE NOTICE '🔄 % (%): Акт % - "%" → "%"',
            slyusar_record.data->>'Name',
            slyusar_record.data->>'Доступ',
            act_number,
            COALESCE(current_date_close, 'null'),
            COALESCE(correct_date_close, 'null');

          -- Оновлюємо дату закриття в акті
          act_entry := jsonb_set(
            act_entry,
            '{ДатаЗакриття}',
            CASE 
              WHEN correct_date_close IS NULL THEN 'null'::jsonb
              ELSE to_jsonb(correct_date_close)
            END
          );

          user_acts_updated := user_acts_updated + 1;
        END IF;

        updated_day_bucket := updated_day_bucket || jsonb_build_array(act_entry);
      END LOOP;

      -- Оновлюємо день в історії
      updated_history := jsonb_set(
        updated_history,
        ARRAY[date_key],
        updated_day_bucket
      );
    END LOOP;

    -- Зберігаємо оновлені дані назад у базу
    IF user_acts_updated > 0 THEN
      UPDATE slyusars
      SET data = jsonb_set(
        slyusar_record.data,
        '{Історія}',
        updated_history
      )
      WHERE slyusar_id = slyusar_record.slyusar_id;

      total_acts_updated := total_acts_updated + user_acts_updated;
      total_users_updated := total_users_updated + 1;

      RAISE NOTICE '✅ %: оновлено % актів',
        slyusar_record.data->>'Name',
        user_acts_updated;
    END IF;
  END LOOP;

  -- Підсумок
  RAISE NOTICE '';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '📊 ПІДСУМОК СИНХРОНІЗАЦІЇ:';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '👥 Оброблено користувачів: %', total_users_processed;
  RAISE NOTICE '✅ Оновлено користувачів: %', total_users_updated;
  RAISE NOTICE '📋 Оновлено актів: %', total_acts_updated;
  RAISE NOTICE '============================================================';

  IF total_acts_updated > 0 THEN
    RAISE NOTICE '✅ Синхронізація завершена успішно!';
  ELSE
    RAISE NOTICE 'ℹ️ Всі дати вже синхронізовані. Оновлень не потрібно.';
  END IF;
END $$;

-- Видаляємо тимчасову функцію
DROP FUNCTION IF EXISTS to_iso_date_only(TIMESTAMP WITH TIME ZONE);

-- ============================================================================
-- КІНЕЦЬ СКРИПТА
-- ============================================================================
