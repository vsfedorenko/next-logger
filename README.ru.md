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

### Бэкенды, которые пишут в `console`

Когда патчинг консоли активен, бэкенд, который сам печатает через
`console.log`/`console.error` (например, кастомный pretty-print бэкенд), не
зацикливается: повторные вызовы `console.*` изнутри логгера уходят в
ОРИГИНАЛЬНЫЕ методы `console`. Вывод сохраняется, рекурсия разорвана.

## Кастомный бэкенд

`@vsfedorenko/next-logger` не привязан к одному движку. По умолчанию это
`consola`, но можно зарегистрировать свой адаптер — winston, pino, loglevel
или любой другой, удовлетворяющий интерфейсу `Logger`.

```ts
import { defineBackend, withLogger } from "@vsfedorenko/next-logger";

defineBackend("winston", (opts) => {
  const winston = createMyWinstonLogger(opts);
  return {
    level: winston.level,
    trace: (...a) => winston.verbose(...a),
    debug: (...a) => winston.debug(...a),
    info: (...a) => winston.info(...a),
    warn: (...a) => winston.warn(...a),
    error: (...a) => winston.error(...a),
    fatal: (...a) => winston.error(...a),
    log: (...a) => winston.info(...a),
    withTag: (tag) => winston.child({ tag }),
  };
});

// Использование:
withLogger({ backend: "winston" })({
  // ...ваш конфиг next
});
```

### Встроенные бэкенды

| Бэкенд    | Пакет     | Описание                                                          |
|-----------|-----------|-------------------------------------------------------------------|
| `consola` | `consola` | По умолчанию — pretty-вывод, подключаемые репортеры (JSON, Sentry). |
| `pino`    | `pino`    | JSON-first, высокая производительность. Опциональная peer-зависимость. |
| `winston` | `winston` | Универсальный, транспортный. Опциональная peer-зависимость.      |

Выбор через `backend` в `withLogger`:

```ts
withLogger({ backend: "pino", backendOptions: { name: "api" } })
```

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

## Редактирование (Redaction)

**Redaction-репортер** — это middleware, вырезающее чувствительные данные из
записей до того, как они попадут в обёрнутый репортер. Защищает каждый
приёмник — JSON, pretty-консоль, Sentry — одним декоратором.

```ts
// instrumentation.ts
import { init, getLogger, createJsonReporter, createRedactionReporter } from "@vsfedorenko/next-logger";

init();
const logger = getLogger();

const json = createJsonReporter();
const redacting = createRedactionReporter({ reporter: json });
logger.setReporters([redacting]);
```

Работают вместе две стратегии:

1. **По паттернам** — регулярные выражения применяются к каждой строке в записи
   (строковые аргументы, тексты ошибок, значения объектов). Из коробки —
   разумные дефолты: email, номера карт, JWT-токены, длинные hex/base64
   API-ключи.

2. **По ключам** — если среди аргументов есть объект с ключом из списка
   чувствительных (`password`, `token`, `apiKey`, …), значение заменяется
   независимо от типа. Исходный объект никогда не мутируется — дальше идёт
   очищенная неглубокая копия.

| Вход                                                    | Выход                                                       |
|---------------------------------------------------------|-------------------------------------------------------------|
| `logger.info("ping admin@example.com")`                  | `ping [REDACTED]`                                           |
| `logger.info("user", { name: "alice", password: "x" })`  | `user` + `{ name: "alice", password: "[REDACTED]" }`        |

### Опции

| Опция         | Тип                  | По умолчанию         | Описание                                                   |
|---------------|----------------------|----------------------|------------------------------------------------------------|
| `reporter`    | `ConsolaReporter`    | *(обязательна)*      | Оборачиваемый репортер, получающий очищенные записи.       |
| `patterns`    | `(RegExp \| string)[]` | встроенные дефолты | Регулярки для строк. Заменяют дефолты.                     |
| `keys`        | `string[]`           | встроенные дефолты   | Имена чувствительных ключей (подстрока, без учёта регистра).|
| `replacement` | `string`             | `"[REDACTED]"`       | Текст подстановки для каждого совпадения.                  |

```ts
// Свои паттерны + ключи + подстановка
const redacting = createRedactionReporter({
  reporter: createJsonReporter(),
  patterns: [/ORD-\d{6}/g],        // только номера заказов (заменяет дефолты)
  keys: ["ssn", "taxId"],          // заменяет дефолтные ключи
  replacement: "***",
});
```

Переданные `patterns` или `keys` **заменяют** дефолты (слияние — осознанный
opt-in: тот, кто передал список, владеет им целиком).

## Pino

**Pino-репортер** прокидывает каждую запись consola в
[pino](https://getpino.io)-логгер. Командам, уже вложившимся в pino —
транспортов, назначений, пайплайнов, тулинга — он позволяет кормить pino
через `next-logger`, не теряя управление уровнями consola, патчинг консоли
и другие репортеры. Consola остаётся единым приёмником; pino становится
одним из его выходов.

```ts
// instrumentation.ts
import { init, getLogger } from "@vsfedorenko/next-logger";
import { createPinoReporter } from "@vsfedorenko/next-logger/reporters/pino";

init();
const logger = getLogger();
logger.addReporter(createPinoReporter({ options: { name: "api" } }));
```

`pino` — **опциональная** peer-зависимость, ставьте только если используете
этот репортер:

```sh
npm install pino
```

Если `pino` не установлен, репортер единожды резолвит динамический импорт,
кэширует неудачу и становится тихим no-op — его можно вешать безусловно.

Уровни consola мапятся на уровни pino так:

| Уровень consola            | Уровень pino |
|----------------------------|--------------|
| `error` / `fatal` (0)      | `error`      |
| `warn` (1)                 | `warn`       |
| `log` (2)                  | `info`       |
| `info` / `success` (3)     | `info`       |
| `debug` (4)                | `debug`      |
| `trace` / `verbose` (5)    | `trace`      |

Каждая запись уходит как `logger.<level>(mergeContext, msg)`:

- **`msg`** — строковые аргументы и `logObj.message`, объединённые в основное
  сообщение.
- **`tag`** — тег consola, передаётся полем `tag` в merge-контексте.
- **структурированные аргументы** — `Error` (`{ name, message, stack }`) и
  плоские объекты мержатся в контекст с ключом по позиции аргумента.

### Опции

| Опция    | Тип         | По умолчанию | Описание                                                          |
|----------|-------------|--------------|-------------------------------------------------------------------|
| `options`| `PinoOptions` | *(нет)*    | Опции для лениво резолвящегося `pino()`-фабрики.                  |
| `logger` | `PinoLogger`  | *(нет)*    | Готовый pino-инстанс. Пропускает вызов фабрики.                   |

Передайте `options`, чтобы репортер собрал pino сам, или `logger`, чтобы
вставить настроенный (транспортов, назначений, своих уровней). Взаимоисключающие:
`logger` выигрывает.

## Winston

**Winston-бэкенд** заменяет приёмник consola на
[winston](https://github.com/winstonjs/winston)-логгер. Командам, уже
вложившимся в winston — транспортов, форматов, своих уровней, файлов логов —
он позволяет пустить весь вывод напрямую в winston. Winston становится
единым приёмником вместо consola.

```ts
// instrumentation.ts
import { init } from "@vsfedorenko/next-logger";
import { registerWinstonBackend } from "@vsfedorenko/next-logger/backends/winston";

registerWinstonBackend();
init();
```

Выбор бэкенда в конфиге Next:

```ts
// next.config.ts
import { withLogger } from "@vsfedorenko/next-logger";

withLogger({ backend: "winston", backendOptions: { level: "info" } })({
  // ...ваш конфиг next
});
```

`winston` — **опциональная** peer-зависимость, ставьте только если
используете этот бэкенд:

```sh
npm install winston
```

Если `winston` не установлен, адаптер при выборе бэкенда кидает понятную
ошибку с инструкцией по установке.

Уровни consola мапятся на уровни winston так:

| Уровень consola            | Уровень winston |
|----------------------------|-----------------|
| `error` / `fatal` (0)      | `error`         |
| `warn` (1)                 | `warn`          |
| `log` (2)                  | `info`          |
| `info` / `success` (3)     | `info`          |
| `debug` (4)                | `debug`         |
| `trace` / `verbose` (5)    | `verbose`       |

Все аргументы уходят в соответствующий метод winston как есть — без
сериализации и склейки строк, так что форматирование winston, splat и
транспортные пайплайны получают оригинальные значения.

`withTag(tag)` создаёт дочерний логгер через `winston.child({ tag })` — тег
едет постоянным биндингом в каждой последующей записи.

## Datadog

**Datadog Logs-репортер** копит записи и отгружает их в
[Datadog Logs intake](https://docs.datadoghq.com/logs/log_collection/?tab=http)
обычным `fetch` — **ноль зависимостей**: пакеты `@datadog/*` не ставятся и не
требуются. API-ключ читается из окружения (`DATADOG_API_KEY` / `DD_API_KEY`)
при создании репортера, а не из конфига.

```ts
// instrumentation.ts
import { init, getLogger } from "@vsfedorenko/next-logger";
import { createDatadogLogsReporter } from "@vsfedorenko/next-logger/reporters/datadog";

init();
const logger = getLogger();
logger.addReporter(
  createDatadogLogsReporter({
    service: "my-next-app",
    env: process.env.NODE_ENV,
    ddtags: "team:web",
  }),
);
```

Записи буферизуются и отправляются, когда накопится `batchSize` записей или
истечёт `flushIntervalMs` — что раньше. У репортера есть явный `flush()` —
вызывайте из shutdown-хука (`SIGTERM`, заморозка serverless), чтобы хвост
буфера уехал, а не пропал при завершении процесса. Ошибки никогда не летят
из `log()`: неудачный батч отбрасывается с одним предупреждением в stderr.
Без API-ключа репортер предупреждает один раз и становится тихим no-op.

### Опции

| Опция              | Тип     | По умолчанию                                     | Описание                                             |
|--------------------|---------|--------------------------------------------------|------------------------------------------------------|
| `site`             | string  | `datadoghq.com`                                  | Сайт Datadog — `<site>` в `http-intake.logs.<site>`. |
| `service`          | string  | *(нет)*                                          | Атрибут `service` у каждой записи.                  |
| `env`              | string  | *(нет)*                                          | Тег `env:<value>` у каждой записи.                  |
| `ddtags`           | string  | *(нет)*                                          | Теги `key:value` через запятую у каждой записи.     |
| `intakeUrl`        | string  | `https://http-intake.logs.<site>/api/v2/logs`   | Полный URL intake (self-hosted / тесты).            |
| `batchSize`        | number  | `50`                                             | Записей на один батч.                               |
| `flushIntervalMs`  | number  | `5000`                                           | Максимум ожидания частичного батча.                 |

## OpenTelemetry (OTLP)

**OTLP-репортер** копит записи и отгружает их в любой OpenTelemetry Collector
по OTLP/HTTP JSON (`/v1/logs`) обычным `fetch` — **ноль зависимостей**: пакеты
`@opentelemetry/*` не ставятся и не требуются. Эндпоинт резолвится из
спецификационных переменных окружения при создании репортера, а не из конфига.

```ts
// instrumentation.ts
import { init, getLogger } from "@vsfedorenko/next-logger";
import { createOtlpLogsReporter } from "@vsfedorenko/next-logger/reporters/otlp";

init();
const logger = getLogger();
logger.addReporter(
  createOtlpLogsReporter({
    serviceName: "my-next-app", // или задайте OTEL_SERVICE_NAME
  }),
);
```

Разрешение из окружения (по спецификации):

| Переменная                            | Значение                                            |
|---------------------------------------|-----------------------------------------------------|
| `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`    | Полный эндпоинт логов, важнее общей базы.           |
| `OTEL_EXPORTER_OTLP_ENDPOINT`         | Общая база — `/v1/logs` добавляется по спеке.       |
| `OTEL_SERVICE_NAME`                   | `service.name` ресурса, если `serviceName` не задан.|

Записи мапятся в OTLP `LogRecord`: числовой уровень consola становится
`severityNumber`/`severityText`, строковые аргументы объединяются в `body`,
`Error`-аргументы попадают в структурные атрибуты `exception`, а
`service.name` едет в ресурсе. Записи буферизуются и отправляются по
`batchSize` или раз в `flushIntervalMs`; явный `flush()` отгружает хвост из
shutdown-хука. Ошибки никогда не летят из `log()`: неудачный батч
отбрасывается с одним предупреждением в stderr. Без эндпоинта репортер
предупреждает один раз и становится тихим no-op.

### Опции

| Опция                | Тип     | По умолчанию                     | Описание                                            |
|----------------------|---------|----------------------------------|-----------------------------------------------------|
| `endpoint`           | string  | *(из env)*                       | Полный эндпоинт коллектора.                         |
| `serviceName`        | string  | `OTEL_SERVICE_NAME`              | `service.name` ресурса.                             |
| `resourceAttributes` | object  | *(нет)*                          | Дополнительные атрибуты ресурса.                    |
| `scopeName`          | string  | `@vsfedorenko/next-logger`       | Имя scope для `scopeLogs`.                          |
| `headers`            | object  | *(нет)*                          | Дополнительные заголовки (auth через gateway).      |
| `batchSize`          | number  | `50`                             | Записей на один батч.                               |
| `flushIntervalMs`    | number  | `5000`                           | Максимум ожидания частичного батча.                 |

## Dev Log Viewer (`/__logs`)

Лог-вьюер только для разработки: ring-buffer-репортер пишет туда всё, что
проходит через логгер, а готовый route-обработчик отдаёт это на `/__logs`.
Ноль зависимостей, ноль клиентского JS.

```ts
// instrumentation.ts — подключить capture-репортер только в dev
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV !== "production") {
    const { init } = await import("@vsfedorenko/next-logger");
    const logger = init();
    logger.addReporter(createLogViewerReporter());
  }
}
```

```ts
// app/__logs/route.ts — страница
import { logViewerHandler } from "@vsfedorenko/next-logger/log-viewer";
export const GET = logViewerHandler;
```

- `GET /__logs` — HTML-таблица без зависимостей (автообновление раз в 5с,
  цвета уровней, раскрывающиеся дополя).
- `GET /__logs?format=json` — сырые записи в JSON для тулинга или своего UI.

Буфер живёт на `globalThis` (зарегистрированный символ), так что бандл
instrumentation и бандл роута — которые Turbopack держит отдельными
инстансами модулей — делят одно кольцо. Буфер ограничен (по умолчанию 500
записей; опция `capacity`), наружу отдаются копии. В production обработчик
отвечает 404, не трогая стор — подключайте репортер только в dev, и буфер
не заполнится.

## Плагины (`defineReporter` / `definePreset`)

Конфиг логгера пересекает границу «сборка → рантайм» как JSON, поэтому несёт
только сериализуемые значения — а репортеры это живые объекты. Плагин-система
наводит мост: регистрируйте **поведение в рантайме** под стабильным именем и
**ссылайтесь на него по имени** из сериализуемого конфига. Функции не
пересекают эту границу — имена пересекают.

### `defineReporter()`

Регистрирует именованную фабрику репортеров (в `instrumentation.ts`, где
выполняется настоящий код). Фабрика получает сериализуемые опции из конфига
и возвращает consola-репортер; секреты читайте внутри фабрики из окружения —
та же политика, что у встроенных репортеров. Повторная регистрация заменяет.

```ts
// instrumentation.ts
import {
  defineReporter,
  definePreset,
  init,
} from "@vsfedorenko/next-logger";
import { createDatadogLogsReporter } from "@vsfedorenko/next-logger/reporters/datadog";

defineReporter("datadog", (options) =>
  createDatadogLogsReporter(options as { service?: string }),
);

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    init();
  }
}
```

```ts
// next.config.ts — репортер по имени (сериализуемо)
import { withLogger } from "@vsfedorenko/next-logger";

export default withLogger({
  reporters: [{ name: "datadog", options: { service: "my-app" } }],
})({ /* … */ });
```

На `init()` спеки резолвятся в живые репортеры и добавляются к собранному
инстансу consola. Фабрика `"json"` встроенная (`{ name: "json" }`);
сетевые репортеры живут на своих subpath-энтрипоинтах, чтобы опциональные
peer'ы оставались tree-shakeable. Неизвестное имя громко падает на `init()`
со списком зарегистрированных фабрик — опечатка никогда молча не теряет логи.

Репортеры цепляются только к consola-логгерам; другие бэкенды (pino/winston)
приносят свои назначения и игнорируют спеки репортеров.

### `definePreset()`

Собирает бэкенд + список репортеров под одним именем — и переключает весь
стек одной строкой в `next.config.ts`:

```ts
// instrumentation.ts
definePreset("production", {
  consola: { level: 3, formatOptions: { date: true } },
  reporters: [{ name: "json" }, { name: "datadog", options: { service: "my-app" } }],

// Голая строка с именем фабрики — сокращение для { name }: reporters: ["json"]
// работает, когда передавать опции не нужно.
});

definePreset("development", {
  consola: { level: 5 },
});
```

```ts
// next.config.ts
export default withLogger({ preset: "production" })({ /* … */ });
```

Правила раскрытия пресета:

- Явные ключи в `withLogger({...})` выигрывают у пресетных.
- Опции `consola` пресета заполняют пробелы под сырым конфигом
  (при конфликте ключей выигрывает сырой).
- Живой инстанс/фабрика consola в сыром конфиге выигрывает безусловно.
- `reporters` из сырого конфига заменяет список пресета целиком.
- Неизвестное имя пресета кидает ошибку на `init()` — опечатки падают громко.

Пресеты — просто данные: храните стеки под окружения (`"production"`,
`"development"`, `"ci"`) в версионном контроле и переключайте окружение,
меняя одну строку.

### Переиспользуемые настройки как npm-пакет

Зарегистрируйте фабрики и пресеты из npm-пакета и ссылайтесь на них по
имени — вся ваша настройка логирования превращается в импорт одной строкой:

```ts
// my-logger-kit.ts — npm-пакет с вашей настройкой логирования
import { defineReporter, definePreset } from "@vsfedorenko/next-logger";
import { createDatadogLogsReporter } from "@vsfedorenko/next-logger/reporters/datadog";

// Переиспользуемая фабрика: опции из конфига, секреты из env.
defineReporter("datadog", (options) =>
  createDatadogLogsReporter(options as { service: string }),
);

// Именованный набор конфигурации: бэкенд + уровень + ссылки на репортеры.
definePreset("acme-prod", {
  consola: { level: 1 },
  reporters: [{ name: "datadog", options: { service: "web" } }],
});
```

```ts
// next.config.ts — всё по именам
import { withLogger } from "@vsfedorenko/next-logger";
export default withLogger({ preset: "acme-prod" })({ /* … */ });
```

```ts
// instrumentation.ts — рантайм-часть: импортируем кит, чтобы фабрики
// существовали до того, как init() развернёт конфиг
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./my-logger-kit");
    const { init } = await import("@vsfedorenko/next-logger");
    init();
  }
}
```

Хелперы реестра: `getReporter` / `hasReporter` / `removeReporter`,
`resolveReporters` (спека → живой репортер), `hasPreset` / `removePreset` /
`getPreset` (все экспортированы из корня).

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

## Сэмплирование логов

Логгеры с большим потоком (постраничные логи, debug-трейсы в горячих циклах,
болтливые зависимости) могут утопить агрегатор. Сэмплирование режет
детерминированную долю вызовов — вы видите представительную выборку вместо
каждой записи.

### `LOG_SAMPLE_RATE`

Задайте `LOG_SAMPLE_RATE` (дробь от `0.0` до `1.0`) — это доля сэмплирования
по умолчанию. Дефолт `1.0` — писать всё.

```bash
# Оставлять ~10% сэмплируемых вызовов.
LOG_SAMPLE_RATE=0.1 next dev
```

Прочитать настроенную долю в рантайме:

```ts
import { resolveSampleRate } from "@vsfedorenko/next-logger";

const rate = resolveSampleRate(); // 0.1 (или 1.0, если не задано)
```

### `sampleLogger`

Оберните любой {@link Logger}, и каждый вызов сэмплируется с заданной долей.
Возвращённый логгер сохраняет `withTag` — дочерний логгер сэмплируется
независимо со своим счётчиком, тег не меняет эффективную долю.

```ts
import { getLogger, sampleLogger } from "@vsfedorenko/next-logger";

// Оставлять ~10% записей болтливого логгера.
const noisy = sampleLogger(getLogger(), 0.1);

noisy.info("request handled", { path: "/healthz" });
noisy.withTag("db").debug("query"); // всё ещё ~10%
```

### `createSamplingWrapper`

Для не-логгерных задач `createSamplingWrapper` возвращает низкоуровневый
сэмплер — им можно обернуть любую функцию с побочным эффектом. Сэмплирование
**детерминированное** (на счётчике, без RNG): при `rate = 0.1` обёрнутая
функция вызывается ровно один раз на 10 вызовов — доля на дистанции точно
держится, тесты воспроизводимы.

```ts
import { createSamplingWrapper } from "@vsfedorenko/next-logger";

const sample = createSamplingWrapper(0.1); // оставлять 1 из 10
sample(() => sendAnalytics("pageview"));
```

| `rate`  | Поведение                                        |
|---------|--------------------------------------------------|
| `≥ 1`   | вызывает всегда                                  |
| `≤ 0`   | не вызывает никогда                              |
| `0–1`   | детерминированная доля (например, `0.1` → 1/10)  |

## Correlation ID

Каждый запрос получает уникальный correlation ID (или переиспользует
пришедший в заголовке `X-Request-ID`), который живёт в том же
`AsyncLocalStorage`, что и request-scoped логгер, — поэтому он появляется в
каждой записи этого запроса без ручной прокидки.

### `correlationMiddleware`

Готовая middleware для Next.js: читает `X-Request-ID` (генерирует UUIDv4,
если нет) и устанавливает активный контекст логирования для обработчиков
дальше по цепочке.

```ts
// middleware.ts
import { correlationMiddleware } from "@vsfedorenko/next-logger";

export const middleware = correlationMiddleware();
export const config = { matcher: ["/((?!_next).*)"] };
```

Обработчики роутов читают ID напрямую:

```ts
import { getCorrelationId } from "@vsfedorenko/next-logger";

export function GET() {
  const id = getCorrelationId(); // "3f2504e0-..."
  return Response.json({ ok: true, correlationId: id });
}
```

Поскольку ID хранится в `LogContext`, `createRequestLogger` автоматически
дописывает его к каждой записи — дополнительная проводка не нужна.

### `getOrCreateCorrelationId`

Возвращает correlation ID текущего scope, генерируя и кэшируя UUIDv4, если
его ещё нет. Повторные вызовы в том же scope возвращают то же значение.

```ts
import { runWithLogContext, getOrCreateCorrelationId } from "@vsfedorenko/next-logger";

runWithLogContext({}, () => {
  const id = getOrCreateCorrelationId(); // сгенерирован + закэширован
  const again = getOrCreateCorrelationId(); // тот же id
});
```

### `setCorrelationId` / `getCorrelationId`

Явный доступ. `setCorrelationId` пишет в активный scope (вызывать внутри
`runWithLogContext`); `getCorrelationId` только читает и возвращает `null`,
когда scope не активен.

```ts
import { runWithLogContext, setCorrelationId, getCorrelationId } from "@vsfedorenko/next-logger";

runWithLogContext({}, () => {
  setCorrelationId("my-trace-id");
  getCorrelationId(); // "my-trace-id"
});

getCorrelationId(); // null (нет scope)
```

| Функция                    | Генерирует? | Без активного scope                 |
|----------------------------|-------------|-------------------------------------|
| `getCorrelationId`         | нет         | возвращает `null`                   |
| `getOrCreateCorrelationId` | да          | эфемерный UUID (не сохраняется)     |
| `setCorrelationId`         | —           | кидает ошибку                       |

## Структурированные метаданные

Прикрепите фиксированный набор полей к каждой записи логгера, не прокидывая
их вручную в каждый вызов. Это fluent-API `logger.with({ requestId, userId })` —
базовый контекст, который наследует каждый последующий вызов.

### `withMetadata`

Оберните любой `Logger` — каждый вызов понесёт метаданные:

```ts
import { getLogger, withMetadata } from "@vsfedorenko/next-logger";

const logger = withMetadata(getLogger(), { requestId: "abc", userId: 42 });

logger.info("processing");          // → info("processing", { requestId: "abc", userId: 42 })
logger.info("done", { ms: 12 });     // → info("done", { requestId: "abc", userId: 42, ms: 12 })
logger.withTag("db").info("query");  // дочерний логгер сохраняет метаданные
```

**Правила слияния** (применяются к каждому аргументу):

| Тип аргумента               | Поведение                                                             |
|-----------------------------|-----------------------------------------------------------------------|
| Строка / число / boolean    | Метаданные добавляются хвостовым объектом                            |
| Плоский объект              | Ключи метаданных мержатся (при коллизии выигрывают ключи вызова)      |
| `Error` / `Date` / массив   | Проходят как есть; метаданные — хвостовым объектом                   |
| Пустые метаданные `{}`      | Аргументы проходят без изменений (без хвостового объекта)            |

`withTag(tag)` возвращает **дочерний логгер с сохранёнными метаданными** —
тег никогда не теряет базовый контекст. Исходные объекты аргументов и
метаданных не мутируются; на каждый вызов создаются новые объекты.

### `LOG_METADATA` / `resolveMetadataFromEnv`

Задайте метаданные на всё развёртывание (имя сервиса, версия, регион) один
раз переменной `LOG_METADATA` — JSON-объектом:

```bash
# Применить на старте, не трогая код приложения.
LOG_METADATA='{"service":"api","version":"1.0"}' next start
```

```ts
import { getLogger, withMetadata, resolveMetadataFromEnv } from "@vsfedorenko/next-logger";

const logger = withMetadata(getLogger(), resolveMetadataFromEnv());
logger.info("boot"); // → info("boot", { service: "api", version: "1.0" })
```

`resolveMetadataFromEnv()` не фатальна: отсутствующее, пустое, битое или
не-объектное значение (массивы, примитивы) возвращает `{}` вместо падения
на старте.

## Отличия от `sainsburys-tech/next-logger`

| Аспект             | sainsburys-tech (pino)                        | этот пакет (consola)                            |
|--------------------|-----------------------------------------------|-------------------------------------------------|
| Бэкенд             | pino (JSON в stdout)                          | consola («pretty» по умолчанию)                 |
| Доставка конфига   | `next-logger.config.js` + preload             | обёртка `withLogger()` (идиоматично, типобезопасно) |
| Перехват           | патчит `next/dist/build/output/log`           | обёртка `console.*` — без патчей internal-модулей Next            |
| Нормализация арг.  | кастомный `hooks.logMethod`                   | не нужна — consola сам работает с console-арг.  |
| Дочерний логгер    | `logger.child({ name })`                      | `consola.withTag(tag)`                          |
| Уровень `trace`    | fallback на `debug` (в Winston нет trace)     | нативный — в consola есть `trace`               |
| Уровень по умолч.  | захардкожен `debug`                           | из env (`LOG_LEVEL`)                            |
| Turbopack          | патч `require.cache` ломается                 | console-sink — работает                         |
| Язык               | обычный JS (CommonJS)                         | TypeScript (вывод CJS)                          |

## Contributing

Вклад приветствуется! Перед открытием pull request прочтите
[руководство для контрибьюторов](./CONTRIBUTING.md) — там настройка окружения,
структура проекта и соглашения. Участвуя, вы соглашаетесь соблюдать
[Кодекс поведения](./CODE_OF_CONDUCT.md).


## Лицензия

MIT
