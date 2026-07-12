# @vsfedorenko/next-logger

[![npm version](https://img.shields.io/npm/v/@vsfedorenko/next-logger.svg)](https://www.npmjs.com/package/@vsfedorenko/next-logger)
[![CI](https://github.com/vsfedorenko/next-logger/actions/workflows/ci.yml/badge.svg)](https://github.com/vsfedorenko/next-logger/actions/workflows/ci.yml)

> Языки: [English](README.md) | **Русский** | [中文](README.zh.md)

**Универсальный набор для логирования в Next.js.**

Оборачивает глобальный `console.*` — тот же приёмник, через который проходит
внутренний логгер Next.js — так что весь диагностический вывод идёт через единый
управляемый по уровню экземпляр [consola](https://github.com/unjs/consola), с
подключаемыми репортерами для структурированного **JSON** и др. Без кастомного
сервера, без monkey-патчинга модулей (который под Turbopack всё равно недостижим).

Вдохновлено [`sainsburys-tech/next-logger`](https://github.com/sainsburys-tech/next-logger),
который делает то же самое на [pino](https://getpino.io). Этот пакет заменяет
pino на consola и доставляет конфигурацию через идиоматическую обёртку
`withLogger()`.

## Установка

```sh
npm install @vsfedorenko/next-logger consola
# или
bun add @vsfedorenko/next-logger consola
```

`consola` — peer-зависимость, устанавливайте её вместе с пакетом.

## Быстрый старт

Два шага.

**1. Оберните конфиг Next.js** (`next.config.ts`):

```ts
import { withLogger } from "@vsfedorenko/next-logger";

export default withLogger({ consola: { level: 4 } })({
  // ...остальной конфиг next
});
```

**2. Вызовите `init()` из instrumentation** (`instrumentation.ts`, корень проекта):

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { init } = await import("@vsfedorenko/next-logger");
    init();
  }
}
```

Готово. Каждый вызов `console.*` на сервере теперь проходит через consola.
Собственные логи Next.js (вывод сборки, компиляция роутов и т. д.) тоже
перехватываются — они используют тот же приёмник `console.*`.

> Рабочий пример приложения — в [`examples/basic/`](examples/basic/).

## Конфигурация

`withLogger(options)` сериализует `options` в переменную окружения
`NEXT_LOGGER_CONFIG` через валидируемый конфиг-ключ `env` в Next.js —
встраивается на этапе сборки, считывается в рантайме. Без предупреждения
«Unrecognized key», работает и под webpack, и под Turbopack.

```ts
withLogger({
  consola: {
    level: 4,                          // debug
    formatOptions: { date: false },    // опции форматирования consola
  },
})
```

Поддерживаются только сериализуемые опции consola (`level`, `formatOptions`, …).

### Пропустить патчинг консоли

`init({ console: false })` создаёт логгер без обёртки `console.*`. Используйте,
если вам нужен настроенный экземпляр consola (через `getLogger()`) для ручного
логирования, но вы предпочитаете не трогать глобальный `console`.

## Уровень логирования

Уровень разрешается по порядку:

1. `consola.level` из `withLogger`
2. `LOG_LEVEL` (число или имя)
3. `NEXT_PUBLIC_LOG_LEVEL` (число или имя)
4. `3` (info) — по умолчанию

Именованные уровни: `silent` (-∞), `fatal` (0), `error` (0), `warn` (1),
`log` (2), `info` (3), `success` (3), `debug` (4), `trace` (5), `verbose` (∞).

## Формат логов

Формат серверного вывода задаётся переменной окружения:

1. `LOG_FORMAT` (`text` или `json`)
2. `NEXT_PUBLIC_LOG_FORMAT` (те же значения)

По умолчанию `text` (стандартный «pretty»-репортер consola).

### `text` (по умолчанию)

Человекочитаемый, с цветами в TTY и временными метками — встроенный репортер
consola. Подходит для локальной разработки.

### `json`

Построчный JSON в stdout (ошибки → stderr), подходит для агрегаторов
структурированных логов (Loki, Datadog, CloudWatch, Elasticsearch). Подходит для
production.

```json
{"level":"info","type":"log","tag":"console","msg":"API /api/hello hit","date":"2026-07-12T10:00:00.000Z"}
```

Каждая строка содержит:

| Поле   | Описание                                                                      |
|--------|-------------------------------------------------------------------------------|
| `level`| Именованный уровень (`error`/`warn`/`info`/`debug`/`trace`)                   |
| `type` | Тип лога consola (`error`, `warn`, `info`, `success`, `ready`, `event` и т.д.)|
| `tag`  | Тег consola (`next.js`, `console`, …)                                         |
| `msg`  | Строка сообщения (строковые аргументы объединяются пробелом)                  |
| `date` | ISO 8601 временная метка                                                       |
| `args` | Дополнительные структурированные аргументы (опускается, если их нет)          |

Ошибки сериализуются как `{ name, message, stack }`. Циклические ссылки
становятся `[Circular]`. BigInt преобразуются в строки.

## Браузер / Client Components

Серверный entrypoint патчит `console.*`, что имеет смысл только в Node.js. Для
Client Components или любого браузерного кода используйте подпуть
**`@vsfedorenko/next-logger/browser`**:

```ts
"use client";
import { logger } from "@vsfedorenko/next-logger/browser";

export function MyComponent() {
  logger.info("отрендерено");
  logger.warn("устаревший API");
  return <div>…</div>;
}
```

Этот entrypoint создаёт экземпляр consola из значений по умолчанию, управляемых
переменными окружения (то же разрешение уровня: `LOG_LEVEL` →
`NEXT_PUBLIC_LOG_LEVEL` → `3`), без серверных механизмов патчинга. Для значений,
встраиваемых на этапе сборки (видимых в браузерном бандле), используйте
`NEXT_PUBLIC_LOG_LEVEL`.

## Как это работает

1. **Обёртка конфига** (`withLogger`, время сборки) — сериализует опции логгера
в `NEXT_LOGGER_CONFIG` через ключ `env` в Next. Next встраивает это на этапе
сборки, поэтому рантайм читает значение как `process.env.NEXT_LOGGER_CONFIG`
   без файловых или внутренних импортов Next.js.

2. **Патч приёмника консоли** (`patches/console.ts`, рантайм) — обёртывает
   `console.{log,debug,info,warn,error}`, так что каждый вызов проходит через
   общий экземпляр consola. `log` и `info` оба мапятся в consola `info`.

3. **Классификатор логов Next** (`patches/next.ts`, рантайм) — проверяет каждый
   вызов `console.*`: если первый аргумент несёт символ-маркер Next.js
   (`▲`, `✓`, `⚠`, `●`, `✗`, …), строка тегируется `next.js`; иначе — `console`.
   Это работает под Turbopack, где старый monkey-патч через `require.cache`
   мёртв (логгер Next живёт в отдельном бандле).

### Пропуск пустых сообщений

Патч пропускает печать, когда сообщение **пустое** — нет аргументов или только
`undefined`/`null`/`""` (значения без диагностической ценности, которые под
consola отрендерились бы как строка с тегом без полезной нагрузки). Это
повторяет поведение самого Next.js, где `prefixedLog` опускает префикс при пустом
сообщении.

Ложные, но присутствующие значения (`0`, `false`) **не** считаются пустыми и
печатаются как обычно.

### Замечание про Turbopack

Стартовый баннер Next.js (**`▲ Next.js`**, `✓ Ready`, …) печатается *до* того,
как срабатывает instrumentation-хук, поэтому эти конкретные строки не
перехватываются. Любой лог после загрузки — компиляция роутов, вывод во время
запроса, ваши собственные вызовы `console.*` — проходит через патч как обычно.

## Отличия от `sainsburys-tech/next-logger`

| Аспект             | sainsburys-tech (pino)                        | этот пакет (consola)                            |
|--------------------|-----------------------------------------------|-------------------------------------------------|
| Бэкенд             | pino (JSON в stdout)                          | consola («pretty» по умолчанию)                 |
| Доставка конфига   | `next-logger.config.js` + preload             | обёртка `withLogger()` (идиоматично, типобезопасно) |
| Перехват           | патчит `next/dist/build/output/log`           | обёртка `console.*` (Turbopack-safe)            |
| Нормализация арг.  | кастомный `hooks.logMethod`                   | не нужна — consola сам работает с console-арг.  |
| Дочерний логгер    | `logger.child({ name })`                      | `consola.withTag(tag)`                          |
| Уровень `trace`    | fallback на `debug` (в Winston нет trace)     | нативный — в consola есть `trace`               |
| Уровень по умолч.  | захардкожен `debug`                           | из env (`LOG_LEVEL`)                            |
| Turbopack          | патч `require.cache` ломается                 | console-sink — работает                         |
| Язык               | обычный JS (CommonJS)                         | TypeScript (вывод CJS)                          |

## Лицензия

MIT
