# @vsfedorenko/next-logger

[![npm version](https://img.shields.io/npm/v/@vsfedorenko/next-logger.svg)](https://www.npmjs.com/package/@vsfedorenko/next-logger)
[![CI](https://github.com/vsfedorenko/next-logger/actions/workflows/ci.yml/badge.svg)](https://github.com/vsfedorenko/next-logger/actions/workflows/ci.yml)

> 语言：[English](README.md) | [Русский](README.ru.md) | **中文**

**一个面向 Next.js 的通用日志工具包。**

它包装全局的 `console.*`——也就是 Next.js 自身内部日志器所流向的同一个
接收端——使所有诊断输出都经过一个可按级别控制的
[consola](https://github.com/unjs/consola) 实例，并提供可插拔的 reporter
接入结构化 **JSON** 等。无需自定义服务器，无需模块 monkey-patch（在
Turbopack 下本来就够不着）。

灵感来自 [`sainsburys-tech/next-logger`](https://github.com/sainsburys-tech/next-logger)，
它用 [pino](https://getpino.io) 实现同样的事。本包将 pino 替换为 consola，
并通过惯用的 `withLogger()` 配置包装器来传递配置。

## 安装

```sh
npm install @vsfedorenko/next-logger consola
# 或
bun add @vsfedorenko/next-logger consola
```

`consola` 是 peer 依赖——请与本包一起安装。

## 快速开始

两步。

**1. 包装你的 Next.js 配置**（`next.config.ts`）：

```ts
import { withLogger } from "@vsfedorenko/next-logger";

export default withLogger({ consola: { level: 4 } })({
  // ...你的其他 next 配置
});
```

**2. 在 instrumentation 中调用 `init()`**（`instrumentation.ts`，项目根目录）：

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { init } = await import("@vsfedorenko/next-logger");
    init();
  }
}
```

完成。服务端的每一个 `console.*` 调用现在都会经过 consola。Next.js 自身的
日志（构建输出、路由编译等）也会被捕获——它们共用同一个 `console.*` 接收端。

> 可运行的示例应用见 [`examples/basic/`](examples/basic/)。

## 配置

`withLogger(options)` 通过 Next.js 经过校验的 `env` 配置键将 `options`
序列化到 `NEXT_LOGGER_CONFIG` 环境变量——构建时内联，运行时读回。不会出现
"Unrecognized key" 警告，在 webpack 和 Turbopack 下都能工作。

```ts
withLogger({
  consola: {
    level: 4,                          // debug
    formatOptions: { date: false },    // consola 格式化选项
  },
})
```

仅支持可序列化的 consola 选项（`level`、`formatOptions`、…）。

### 跳过 console 补丁

`init({ console: false })` 构建日志器但不包装 `console.*`。如果你只想要
配置好的 consola 实例（通过 `getLogger()`）做手动日志、但不想动全局
`console`，就用这个。

## 日志级别

级别按以下顺序解析：

1. 来自 `withLogger` 的 `consola.level`
2. `LOG_LEVEL`（数字或名称）
3. `NEXT_PUBLIC_LOG_LEVEL`（数字或名称）
4. `3`（info）——默认值

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
{"level":"info","type":"log","tag":"console","msg":"API /api/hello hit","date":"2026-07-12T10:00:00.000Z"}
```

每行包含：

| 字段   | 说明                                                                  |
|--------|-----------------------------------------------------------------------|
| `level`| 命名级别（`error`/`warn`/`info`/`debug`/`trace`）                     |
| `type` | consola 日志类型（`error`、`warn`、`info`、`success`、`ready`、`event` 等）|
| `tag`  | consola 标签（`next.js`、`console`、…）                               |
| `msg`  | 消息字符串（多个字符串参数以空格连接）                                |
| `date` | ISO 8601 时间戳                                                       |
| `args` | 额外的结构化参数（无则省略）                                          |

错误会被序列化为 `{ name, message, stack }`。循环引用会变成
`[Circular]`。BigInt 会被转成字符串。

## 浏览器 / Client Components

服务端入口会补丁 `console.*`，这只在 Node.js 中有意义。对于
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
`LOG_LEVEL` → `NEXT_PUBLIC_LOG_LEVEL` → `3`），不含任何服务端补丁机制。
若要让级别在构建期内联进浏览器 bundle，请使用 `NEXT_PUBLIC_LOG_LEVEL`。

## 工作原理

1. **配置包装器**（`withLogger`，构建时）——将日志器选项序列化到
   `NEXT_LOGGER_CONFIG`，通过 Next 的 `env` 键。Next 在构建时将其内联，
   因此运行时通过 `process.env.NEXT_LOGGER_CONFIG` 读取，无需文件系统或
   Next.js 内部导入。

2. **Console 接收端补丁**（`patches/console.ts`，运行时）——包装
   `console.{log,debug,info,warn,error}`，使每次调用都经过共享的 consola
   实例。`log` 与 `info` 都映射到 consola 的 `info`。

3. **Next 日志分类器**（`patches/next.ts`，运行时）——检查每个 `console.*`
   调用：如果第一个参数携带 Next.js 标记符号（`▲`、`✓`、`⚠`、`●`、`✗`、…），
   该行标记为 `next.js`；否则标记为 `console`。这在 Turbopack 下有效，
   因为旧的基于 `require.cache` 的 monkey-patch 已经失效（Next 的日志器
   存在于单独的 bundle 实例中）。

### 空消息跳过

当消息为**空**时（没有参数，或只有 `undefined`/`null`/`""`——即没有诊断
价值、在 consola 下会渲染成一条只有标签而无内容的行），补丁会跳过打印。
这镜像了 Next.js 自身的行为：`prefixedLog` 在消息为空时会丢弃前缀。

为假但存在的值（`0`、`false`）**不**算作空，会照常打印。

### Turbopack 说明

Next.js 的**启动横幅**（`▲ Next.js`、`✓ Ready`、…）在 instrumentation 钩子
运行*之前*就打印了，所以这些特定行不会被捕获。启动后发出的任何日志——
路由编译、请求时输出、你自己的 `console.*` 调用——都会正常经过补丁。

## 与 `sainsburys-tech/next-logger` 的差异

| 关注点     | sainsburys-tech (pino)                    | 本包 (consola)                              |
|------------|-------------------------------------------|---------------------------------------------|
| 后端       | pino（JSON 到 stdout）                    | consola（默认 pretty）                      |
| 配置传递   | `next-logger.config.js` + 预加载          | `withLogger()` 包装器（惯用、类型安全）     |
| 拦截方式   | 补丁 `next/dist/build/output/log`         | 包装 `console.*` 接收端（Turbopack 安全）   |
| 参数归一化 | 自定义 `hooks.logMethod`                  | 无需——consola 自带处理 console 风格参数     |
| 子日志器   | `logger.child({ name })`                  | `consola.withTag(tag)`                      |
| `trace` 级 | 回退到 `debug`（Winston 无 trace）        | 原生——consola 有 `trace`                    |
| 默认级别   | 硬编码 `debug`                            | 由环境驱动（`LOG_LEVEL`）                   |
| Turbopack  | `require.cache` 补丁失效                  | console 接收端——正常工作                    |
| 语言       | 纯 JS（CommonJS）                         | TypeScript（CJS 输出）                      |

## 许可证

MIT
