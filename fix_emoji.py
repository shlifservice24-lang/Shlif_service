import sys

# Читаємо файл
with open(r'd:\Alim\Проект\Shlif_service\Shlif_service\src\ts\roboha\tablucya\tablucya.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Виконуємо заміну
content = content.replace('✅ Дзвінок: взяв слухавку', '📞 Дзвінок: взяв слухавку')

# Записуємо назад
with open(r'd:\Alim\Проект\Shlif_service\Shlif_service\src\ts\roboha\tablucya\tablucya.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print('Заміну виконано успішно!')
