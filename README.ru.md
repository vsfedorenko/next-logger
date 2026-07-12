# @vsfedorenko/next-logger

[![npm version](https://img.shields.io/npm/v/@vsfedorenko/next-logger.svg)](https://www.npmjs.com/package/@vsfedorenko/next-logger)

> Языки: [English](README.md) | **Русский** | [中文](README.zh.md)

**Универсальный набор для логирования в Next.js.**

Патчит внутренний логгер Next.js (`next/dist/build/output/log`) **и** глобальный
объект `console.*`, так что весь диагностический вывод проходит через единый
управляемый по уровню приёмник — по умолчанию [consola](https://github.com/unjs/consola),
с подключаемыми репортерами для **Sentry**, структурированного **JSON** и других —
без кастомного Next.js-сервера.

Вдохновлено [`sainsburys-tech/next-logger`](https://github.com/sainsburys-tech/next-logger),
который делает то же самое на [pino](https://getpino.io). Этот пакет заменяет
pino на consola в качестве бэкенда по умолчанию и добавляет API репортеров,
чтобы логи можно было разветвлять в любую интеграцию (Sentry breadcrumbs,
JSON-агрегаторы и т. д.).

## Установка

```sh
bun add @vsfedorenko/next-logger consola
# или
npm install @vsfedorenko/next-logger consola
```

`consola` — peer-зависимость, устанавливайте её вместе с пакетом.

## Использование

### Вариант A — Instrumentation-хук (рекомендуется)

```ts
// instrumentation.ts (корень проекта)
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@vsfedorenko/next-logger");
  }
}
```

Импорт по умолчанию применяет оба патча: логгер Next.js **и** глобальный
`console.*`.

### Вариант B — предзагрузка через `-r`

```sh
node -r @vsfedorenko/next-logger server.js
```

### Патч только Next (не трогать `console`)

```ts
// instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@vsfedorenko/next-logger/presets/next-only");
  }
}
```

Полезно, когда нужно направить внутренние логи Next в consola, но оставить
родное форматирование `console.*` (например, в разработке).

### Браузер / Client Components

Главный entrypoint (`@vsfedorenko/next-logger`) импортирует модули патчей,
которые зависят от `require.cache` и `lilconfig` — ни того, ни другого нет в
браузерном бандле. Для Client Components или любого браузерного кода используйте
подпуть **`@vsfedorenko/next-logger/browser`**:

```ts
"use client";
import { logger } from "@vsfedorenko/next-logger/browser";

export function MyComponent() {
  logger.info("отрендерено");
  logger.warn("устаревший API");
  return <div>…</div>;
}
```

Этот entrypoint создаёт экземпляр consola из значений по умолчанию, driven
переменными окружения (то же разрешение уровня: `LOG_LEVEL` →
`NEXT_PUBLIC_LOG_LEVEL` → `3`), без серверной machinery патчей. Для значений,
инлайнящихся на этапе сборки (видимых в браузерном бандле), используйте
`NEXT_PUBLIC_LOG_LEVEL`.

## Конфигурация

Необязательный конфигурационный файл (ищется от cwd вверх через
[lilconfig](https://github.com/antonk52/lilconfig)). Поддерживаемые имена файлов:

- `next-logger.config.ts` / `next-logger.config.js` / `next-logger.config.cjs`
- `.next-loggerrc.ts` / `.next-loggerrc.js` / `.next-loggerrc.cjs`
- `.next-loggerrc` (JSON)
- `.next-loggerrc.json`
- ключ `next-logger` в `package.json`

**TypeScript-конфиги** (`.ts`) загружаются через [jiti](https://github.com/unjs/jiti).
Установите его как опциональную peer-зависимость:

```sh
bun add -d jiti   # или: npm install -D jiti
```

### Кастомный экземпляр consola

```ts
// next-logger.config.ts
import { createConsola } from "consola";

export default {
  consola: createConsola({ level: 4 }),
};
```

### Частичные опции (сливаются со значениями по умолчанию)

```ts
import type { ConsolaOptions } from "consola";

export default {
  consola: { level: 4, formatOptions: { date: false } } satisfies Partial<ConsolaOptions>,
};
```

### Фабрика (получает значения по умолчанию от библиотеки)

```ts
import type { ConsolaOptions } from "consola";
import { createConsola } from "consola";

export default {
  consola: (defaults: Partial<ConsolaOptions>) =>
    createConsola({ ...defaults, level: 5 }),
};
```

## Уровень логирования

Без конфигурационного файла уровень разрешается в порядке (по очереди):

1. `LOG_LEVEL` (число или имя)
2. `NEXT_PUBLIC_LOG_LEVEL` (число или имя)

Со значением по умолчанию `3` (info).

Именованные уровни: `silent` (-∞), `fatal` (0), `error` (0), `warn` (1),
`log` (2), `info` (3), `success` (3), `debug` (4), `trace` (5), `verbose` (∞).

## Формат логов

Формат серверного вывода задаётся переменной окружения:

1. `LOG_FORMAT` (`text` или `json`)
2. `NEXT_PUBLIC_LOG_FORMAT` (те же значения)

По умолчанию `text` (стандартный pretty-репортер consola).

### `text` (по умолчанию)

Человекочитаемый, с цветами в TTY и временными метками — встроенный репортер
consola. Подходит для локальной разработки.

### `json`

Построчный JSON в stdout (ошибки → stderr), подходит для агрегаторов
структурированных логов (Loki, Datadog, CloudWatch, Elasticsearch). Подходит для
production.

```json
{"level":"error","type":"error","tag":"next.js","msg":"failed to compile","date":"2026-07-11T13:43:10.712Z"}
```

Каждая строка содержит:

| Поле   | Описание                                                                      |
|--------|-------------------------------------------------------------------------------|
| `level`| Именованный уровень (`error`/`warn`/`info`/`debug`/`trace`)                   |
| `type` | Тип лога consola (`error`, `warn`, `info`, `success`, `ready`, `event` и т.д.)|
| `tag`  | Тег consola (`next.js`, `console`, `app`, …)                                  |
| `msg`  | Строка сообщения (строковые аргументы объединяются пробелом)                  |
| `date` | ISO 8601 временная метка                                                       |
| `args` | Дополнительные структурированные аргументы (опускается, если их нет)          |

Ошибки сериализуются как `{ name, message, stack }`. Циклические ссылки
становятся `[Circular]`. BigInt преобразуются в строки.

Применяется только к серверному entrypoint (`@vsfedorenko/next-logger`) —
браузерный entrypoint всегда использует встроенный браузерный репортер consola.
Кастомный экземпляр consola из конфигурационного файла полностью обходит выбор
формата.

## Как это работает

1. **Патч логгера Next.js** (`patches/next.ts`) — заменяет методы, экспортируемые
   из `next/dist/build/output/log` (`wait`, `error`, `warn`, `ready`, `info`,
   `event`, `trace`), привязанными методами consola с тегом `next.js`.
   Сохраняет критический обход для Next 13+: поскольку Next определяет эти
   экспорты как неконфигурируемые аксессоры, патч заменяет
   `require.cache[...].exports` мелкой копией, а затем переопределяет каждый
   метод на копии.

2. **Патч консоли** (`patches/console.ts`) — перезаписывает
   `console.{log,debug,info,warn,error}` привязанными методами consola с тегом
   `console`. `log` и `info` оба мапятся в consola `info`.

Оба патча используют единый экземпляр consola, создаваемый в `logger.ts`, поэтому
уровень логирования управляется из одного места.

### Пропуск пустых сообщений

Оба патча пропускают печать, когда сообщение **пустое** — нет аргументов или
только `undefined`/`null`/`""` (значения без диагностической ценности, которые
под consola отрендерились бы как строка с тегом без полезной нагрузки). Это
повторяет поведение самого Next.js, где `prefixedLog` опускает префикс при пустом
сообщении.

Ложные, но присутствующие значения (`0`, `false`) **не** считаются пустыми и
печатаются как обычно.

## Отличия от `sainsburys-tech/next-logger`

| Аспект             | sainsburys-tech (pino)                        | этот пакет (consola)                            |
|--------------------|-----------------------------------------------|-------------------------------------------------|
| Бэкенд             | pino (JSON в stdout)                          | consola (pretty по умолчанию)                   |
| Нормализация арг.  | кастомный `hooks.logMethod`                   | не нужна — consola сам работает с console-арг.  |
| Дочерний логгер    | `logger.child({ name })`                      | `consola.withTag(tag)`                          |
| Кастомный бэкенд   | любой логгер с `.child()` (pino, winston, …)  | только экземпляры/опции consola                 |
| Уровень `trace`    | fallback на `debug` (в Winston нет trace)     | нативный — в consola есть `trace`               |
| Уровень по умолч.  | захардкожен `debug`                           | из env (`LOG_LEVEL`)                            |
| Язык               | обычный JS (CommonJS)                         | TypeScript (вывод CJS)                          |

## Лицензия

MIT
