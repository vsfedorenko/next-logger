# @vsfedorenko/next-logger

[![npm version](https://img.shields.io/npm/v/@vsfedorenko/next-logger.svg)](https://www.npmjs.com/package/@vsfedorenko/next-logger)

> 语言：[English](README.md) | [Русский](README.ru.md) | **中文**

**一个面向 Next.js 的通用日志工具包。**

它 monkey-patch Next.js 的内部日志器（`next/dist/build/output/log`）**以及**
全局的 `console.*`，使所有诊断输出都流向一个可按级别控制的统一接收端
——默认使用 [consola](https://github.com/unjs/consola)，并提供可插拔的
reporter 接入 **Sentry**、结构化 **JSON** 等——无需自定义 Next.js 服务器。

灵感来自 [`sainsburys-tech/next-logger`](https://github.com/sainsburys-tech/next-logger)，
它用 [pino](https://getpino.io) 实现同样的事。本包将 pino 替换为 consola
作为默认后端，并增加了 reporter API，使日志可以分发到任意集成
（Sentry breadcrumbs、JSON 聚合器等）。

## 安装

```sh
bun add @vsfedorenko/next-logger consola
# 或
npm install @vsfedorenko/next-logger consola
```

`consola` 是 peer 依赖——请与本包一起安装。

## 用法

### 方式 A —— Instrumentation 钩子（推荐）

```ts
// instrumentation.ts（项目根目录）
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@vsfedorenko/next-logger");
  }
}
```

默认导入会同时应用两个补丁：Next.js 的日志器**以及**全局的 `console.*`。

### 方式 B —— `-r` 预加载

```sh
node -r @vsfedorenko/next-logger server.js
```

### 仅 patch Next（不改动 `console`）

```ts
// instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@vsfedorenko/next-logger/presets/next-only");
  }
}
```

当你想让 Next 的内部日志走 consola、但又想保留原生 `console.*` 格式化时
（例如在开发环境）很有用。

### 浏览器 / Client Components

主入口（`@vsfedorenko/next-logger`）导入了补丁模块，它们依赖
`require.cache` 和 `lilconfig`——这两者在浏览器 bundle 中都不存在。对于
Client Components 或任何浏览器端代码，请使用
**`@vsfedorenko/next-logger/browser`** 子路径：

```ts
"use client";
import { logger } from "@vsfedorenko/next-logger/browser";

export function MyComponent() {
  logger.info("已渲染");
  logger.warn("弃用提示");
  return <div>…</div>;
}
```

该入口基于环境变量驱动的默认值构建一个 consola 实例（同样的级别解析：
`LOG_LEVEL` → `NEXT_PUBLIC_LOG_LEVEL` → `3`），不含服务端补丁机制。若要让
级别在构建期内联进浏览器 bundle，请使用 `NEXT_PUBLIC_LOG_LEVEL`。

## 配置

可选的配置文件（通过 [lilconfig](https://github.com/antonk52/lilconfig)
从 cwd 向上查找）。支持的文件名：

- `next-logger.config.ts` / `next-logger.config.js` / `next-logger.config.cjs`
- `.next-loggerrc.ts` / `.next-loggerrc.js` / `.next-loggerrc.cjs`
- `.next-loggerrc`（JSON）
- `.next-loggerrc.json`
- `package.json` 中的 `next-logger` 字段

**TypeScript 配置**（`.ts`）通过 [jiti](https://github.com/unjs/jiti) 加载。
请将其安装为可选 peer 依赖：

```sh
bun add -d jiti   # 或：npm install -D jiti
```

### 自定义 consola 实例

```ts
// next-logger.config.ts
import { createConsola } from "consola";

export default {
  consola: createConsola({ level: 4 }),
};
```

### 部分选项（与默认值合并）

```ts
import type { ConsolaOptions } from "consola";

export default {
  consola: { level: 4, formatOptions: { date: false } } satisfies Partial<ConsolaOptions>,
};
```

### 工厂函数（接收库的默认值）

```ts
import type { ConsolaOptions } from "consola";
import { createConsola } from "consola";

export default {
  consola: (defaults: Partial<ConsolaOptions>) =>
    createConsola({ ...defaults, level: 5 }),
};
```

## 日志级别

没有配置文件时，级别按以下顺序解析：

1. `LOG_LEVEL`（数字或名称）
2. `NEXT_PUBLIC_LOG_LEVEL`（数字或名称）

默认回退到 `3`（info）。

命名级别：`silent` (-∞)、`fatal` (0)、`error` (0)、`warn` (1)、
`log` (2)、`info` (3)、`success` (3)、`debug` (4)、`trace` (5)、`verbose` (∞)。

## 日志格式

服务端输出格式由环境变量控制：

1. `LOG_FORMAT`（`text` 或 `json`）
2. `NEXT_PUBLIC_LOG_FORMAT`（同上）

默认回退到 `text`（consola 默认的 pretty reporter）。

### `text`（默认）

人类可读，在 TTY 中带颜色与时间戳——consola 内置的 reporter。适合本地
开发。

### `json`

按行输出 JSON 到 stdout（错误 → stderr），适合结构化日志聚合器
（Loki、Datadog、CloudWatch、Elasticsearch）。适合生产环境。

```json
{"level":"error","type":"error","tag":"next.js","msg":"failed to compile","date":"2026-07-11T13:43:10.712Z"}
```

每行包含：

| 字段   | 说明                                                                 |
|--------|----------------------------------------------------------------------|
| `level`| 命名级别（`error`/`warn`/`info`/`debug`/`trace`）                     |
| `type` | consola 日志类型（`error`、`warn`、`info`、`success`、`ready`、`event` 等）|
| `tag`  | consola 标签（`next.js`、`console`、`app`、…）                        |
| `msg`  | 消息字符串（多个字符串参数以空格连接）                                |
| `date` | ISO 8601 时间戳                                                      |
| `args` | 额外的结构化参数（无则省略）                                          |

错误会被序列化为 `{ name, message, stack }`。循环引用会变成
`[Circular]`。BigInt 会被转成字符串。

仅对服务端入口（`@vsfedorenko/next-logger`）生效——浏览器入口始终使用
consola 内置的浏览器 reporter。来自配置文件的自定义 consola 实例会完全
绕过格式选择。

## 工作原理

1. **Next.js 日志器补丁**（`patches/next.ts`）——替换 `next/dist/build/output/log`
   导出的方法（`wait`、`error`、`warn`、`ready`、`info`、`event`、`trace`），
   改为带 `next.js` 标签的 consola 绑定方法。保留了关键的 Next 13+ 绕过方案：
   由于 Next 把这些导出定义为不可配置的访问器，补丁会用浅拷贝替换
   `require.cache[...].exports`，然后在拷贝上重定义每个方法。

2. **Console 补丁**（`patches/console.ts`）——用带 `console` 标签的 consola
   绑定方法覆写 `console.{log,debug,info,warn,error}`。`log` 与 `info` 都
   映射到 consola 的 `info`。

两个补丁共享由 `logger.ts` 构建的同一个 consola 实例，因此日志级别可从
单一位置控制。

### 空消息跳过

当消息为**空**时（没有参数，或只有 `undefined`/`null`/`""`——即没有诊断
价值、在 consola 下会渲染成一条只有标签而无内容的行），两个补丁都会跳过
打印。这镜像了 Next.js 自身的行为：`prefixedLog` 在消息为空时会丢弃前缀。

为假但存在的值（`0`、`false`）**不**算作空，会照常打印。

## 与 `sainsburys-tech/next-logger` 的差异

| 关注点     | sainsburys-tech (pino)                    | 本包 (consola)                              |
|------------|-------------------------------------------|---------------------------------------------|
| 后端       | pino（JSON 到 stdout）                    | consola（默认 pretty）                      |
| 参数归一化 | 自定义 `hooks.logMethod`                  | 无需——consola 自带处理 console 风格参数     |
| 子日志器   | `logger.child({ name })`                  | `consola.withTag(tag)`                      |
| 自定义后端 | 任何带 `.child()` 的日志器（pino、winston…）| 仅 consola 实例/选项                        |
| `trace` 级 | 回退到 `debug`（Winston 无 trace）        | 原生——consola 有 `trace`                    |
| 默认级别   | 硬编码 `debug`                            | 由环境驱动（`LOG_LEVEL`）                   |
| 语言       | 纯 JS（CommonJS）                         | TypeScript（CJS 输出）                      |

## 许可证

MIT
