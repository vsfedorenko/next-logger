# Changelog

All notable changes to this project are generated automatically from
[conventional commits](https://www.conventionalcommits.org/) via
[git-cliff](https://git-cliff.org).

## [unreleased]

### Fixed


- Unknown preset via NEXT_LOGGER_CONFIG fails loudly at init (#66) ([`ad821ae`](https://github.com/vsfedorenko/next-logger/commit/ad821aea15ebf5829aa0962b2e0f47229a8197dc))
## [0.8.3](https://github.com/vsfedorenko/next-logger/releases/tag/v0.8.3) — 2026-08-26

### Documentation


- Update CHANGELOG.md ([`9441766`](https://github.com/vsfedorenko/next-logger/commit/94417665ffe05373869ee14f8690f9657eb05d60))

- Update CHANGELOG.md ([`10b798e`](https://github.com/vsfedorenko/next-logger/commit/10b798ec8d48f8e8f66aad2ed2d798f23a237a6d))

- Update CHANGELOG.md ([`49d137d`](https://github.com/vsfedorenko/next-logger/commit/49d137d03f20bb7ba6b072c2f3981eea5a47fff0))

### Fixed


- Break console.log recursion for backends that write to console (#63) ([`0e1a274`](https://github.com/vsfedorenko/next-logger/commit/0e1a274167efc51698203af38f6192d5a67cfc49))

- Fail fast on wrong-shaped registry arguments (defineBackend/Reporter/Preset) (#64) ([`d89229d`](https://github.com/vsfedorenko/next-logger/commit/d89229dc85f936baf0af0fb0918fa23874a28067))
## [0.8.2](https://github.com/vsfedorenko/next-logger/releases/tag/v0.8.2) — 2026-08-26

### CI


- Bump actions/checkout from 4 to 7 (#59) ([`1a1ceb5`](https://github.com/vsfedorenko/next-logger/commit/1a1ceb5f6689793a2733a2a442b80af26e73cc94))

- Bump actions/dependency-review-action from 4 to 5 (#60) ([`1370b4f`](https://github.com/vsfedorenko/next-logger/commit/1370b4ffff1e57e8a40db3ce47100019e07b604b))

### Documentation


- Update CHANGELOG.md ([`3acc960`](https://github.com/vsfedorenko/next-logger/commit/3acc960dbfb5b033a0a73c158b73f563723f6be6))

- Update CHANGELOG.md ([`8881fca`](https://github.com/vsfedorenko/next-logger/commit/8881fcad25ff81e6d41902b6736c5ec10a22fa06))

- Update CHANGELOG.md ([`deca7f1`](https://github.com/vsfedorenko/next-logger/commit/deca7f1379806c1b059bcd88b8e4681ef95d14a4))

- Update CHANGELOG.md ([`d17beee`](https://github.com/vsfedorenko/next-logger/commit/d17beee715ecac17c0d9624477f0d0856b10e5f8))
## [0.8.1](https://github.com/vsfedorenko/next-logger/releases/tag/v0.8.1) — 2026-08-21

### Documentation


- Update CHANGELOG.md ([`fd30d60`](https://github.com/vsfedorenko/next-logger/commit/fd30d6063ca0abd22d3c10f311d85475f9dbf24a))

- Update CHANGELOG.md ([`38b2e55`](https://github.com/vsfedorenko/next-logger/commit/38b2e55346c094720c85e7895ee1c057416a8bdf))

- Update CHANGELOG.md ([`0f095c3`](https://github.com/vsfedorenko/next-logger/commit/0f095c38e213654d1bdb8ebfddc5978529c4c9ee))

- Update CHANGELOG.md ([`2bfb2d6`](https://github.com/vsfedorenko/next-logger/commit/2bfb2d6a3d111ffdbc10c877b4de1679a9286f95))

### Fixed


- Accept ReporterRef shorthand in config types — strings are typed inputs, not casts (#57) ([`e66eef7`](https://github.com/vsfedorenko/next-logger/commit/e66eef7ca8bb1b161cb916eabd625d0c5581851d))
## [0.8.0](https://github.com/vsfedorenko/next-logger/releases/tag/v0.8.0) — 2026-08-21

### Added


- Reporter string shorthand in configs — reporters: ["json"] resolves like { name } (#54) ([`c55a03d`](https://github.com/vsfedorenko/next-logger/commit/c55a03d4d46245c08b4759ba383c1097b0abab5c))

### CI


- Build before test in release workflow (#47) ([`5472bb4`](https://github.com/vsfedorenko/next-logger/commit/5472bb4bc1205704593114e86285eee5581f9301))

### Documentation


- Update CHANGELOG.md ([`a944314`](https://github.com/vsfedorenko/next-logger/commit/a94431492795732ca754f3007c3e682a85c0ad98))

- Document the plugin system (defineReporter / definePreset) (#48) ([`ff7e7c3`](https://github.com/vsfedorenko/next-logger/commit/ff7e7c349759ab77bb92a5519a73ef84a224f385))

- Update CHANGELOG.md ([`b3fb7fa`](https://github.com/vsfedorenko/next-logger/commit/b3fb7fa722f69ba83510852469a9fba72877dd4c))

- Update CHANGELOG.md ([`88ad6f5`](https://github.com/vsfedorenko/next-logger/commit/88ad6f59ca418b937d911bbbfe19fa58c9c90343))

- **ru:** Synchronize README.ru.md with the English README — translate 13 missing sections (#50) ([`f3a0aa8`](https://github.com/vsfedorenko/next-logger/commit/f3a0aa818f0a8616cd8ecc7613f02324457e10ad))

- Update CHANGELOG.md ([`8a37588`](https://github.com/vsfedorenko/next-logger/commit/8a37588c7110961206cf8d61540eed192e80464c))

- Merge duplicate plugin sections into one (EN + RU) (#51) ([`4cde3fc`](https://github.com/vsfedorenko/next-logger/commit/4cde3fcb257d18730dfd73bc88ea05ac2d98d10e))

- Update CHANGELOG.md ([`2685042`](https://github.com/vsfedorenko/next-logger/commit/2685042d79c39dfb1deda098534b580ab01055f6))

- Update CHANGELOG.md ([`20e5cc5`](https://github.com/vsfedorenko/next-logger/commit/20e5cc541ba97f883d85a944015fafbf92939b4e))

- Drop the Turbopack-safe claim — describe what the wrapper actually does (#53) ([`0711b7f`](https://github.com/vsfedorenko/next-logger/commit/0711b7fef14bb63da9804f0cf5ca168bec371634))

- Update CHANGELOG.md ([`d18300b`](https://github.com/vsfedorenko/next-logger/commit/d18300b3628e9017d84cb5c33344521e7d814a0d))

- Update CHANGELOG.md ([`57c772f`](https://github.com/vsfedorenko/next-logger/commit/57c772f9333889ed4f5cea2d38e0777bed4754ea))
## [0.7.0](https://github.com/vsfedorenko/next-logger/releases/tag/v0.7.0) — 2026-08-17

### Added


- Winston backend e2e suite + container-logger resolution (roadmap v0.7) (#37) ([`4ba5f66`](https://github.com/vsfedorenko/next-logger/commit/4ba5f66410334cf4d4a4311f577d879aa175d65a))

- Datadog Logs reporter — fetch-based, zero dependencies (roadmap v0.7) (#40) ([`55cb2ac`](https://github.com/vsfedorenko/next-logger/commit/55cb2acd7d4fe71286c80556e6e594d25d7577b8))

- OpenTelemetry OTLP/HTTP JSON logs reporter — zero dependencies (roadmap v0.7) (#43) ([`5a0996d`](https://github.com/vsfedorenko/next-logger/commit/5a0996d26ef8ce724eeb0a733d9d6c9e3372d7bc))

- Dev-only /__logs log viewer — ring buffer reporter + route handler (roadmap v0.7) (#44) ([`ca5b61b`](https://github.com/vsfedorenko/next-logger/commit/ca5b61b8f768944f418729b3ad75b6bb2b5b5a4f))

- Plugin system — defineReporter() / definePreset() APIs (#45) ([`938481d`](https://github.com/vsfedorenko/next-logger/commit/938481d61c8b6107ed5d9bfc2d240c0ac86d0016))

### CI


- Bump actions/deploy-pages from 4 to 5 (#34) ([`f422d27`](https://github.com/vsfedorenko/next-logger/commit/f422d2744333a83cec9e3a8cbe7bae7afac2c4ad))

- Bump actions/upload-artifact from 4 to 7 (#29) ([`f87b1ab`](https://github.com/vsfedorenko/next-logger/commit/f87b1ab23f43ff7ba9bde85e7b3e879c5a09764e))

- Bump actions/configure-pages from 5 to 6 (#30) ([`b0d3c3e`](https://github.com/vsfedorenko/next-logger/commit/b0d3c3e566d97f8358ea7c12c34fec0eb543b9d6))

- Bump actions/upload-pages-artifact from 3 to 5 (#31) ([`c9f9d05`](https://github.com/vsfedorenko/next-logger/commit/c9f9d056a3b04a2a907a51e4302074a07609a79c))

### Changed


- Extract shared e2e harness into e2e/helpers.ts (#38) ([`3b856e4`](https://github.com/vsfedorenko/next-logger/commit/3b856e4c56e2309f6fd15190e2dc4d9923563515))

- Consolidate peer lazy-require into shared peer-require.ts (#39) ([`7fd6e59`](https://github.com/vsfedorenko/next-logger/commit/7fd6e599006cbd4d1a3a727371745ebf104d010e))

### Documentation


- Update CHANGELOG.md ([`70a1c37`](https://github.com/vsfedorenko/next-logger/commit/70a1c378f4b68c2754245f86fb904f1dd3165bc8))

- Update CHANGELOG.md ([`a8c0e37`](https://github.com/vsfedorenko/next-logger/commit/a8c0e37f26bceeda707731984c6736d0ba947818))

- Update CHANGELOG.md ([`c95c5c6`](https://github.com/vsfedorenko/next-logger/commit/c95c5c64672c01814c715e99e6745602dcf202e5))

- Update CHANGELOG.md ([`51e5d52`](https://github.com/vsfedorenko/next-logger/commit/51e5d526a590336e895ab7803ce54d93bfac7f87))

- Update CHANGELOG.md ([`20598c4`](https://github.com/vsfedorenko/next-logger/commit/20598c4e4949f716c662a8367f7d225d2a37534c))

- Update CHANGELOG.md ([`9b0eb08`](https://github.com/vsfedorenko/next-logger/commit/9b0eb086fd36d26aa2484770ff8b925bbecbd813))

- Update CHANGELOG.md ([`5fc31eb`](https://github.com/vsfedorenko/next-logger/commit/5fc31eba670208bf600eed1740a2ec731804b8a4))

- Update CHANGELOG.md ([`b24a06a`](https://github.com/vsfedorenko/next-logger/commit/b24a06af107229aa39686a06e64eb0afd22483b3))

- Update CHANGELOG.md ([`162e04c`](https://github.com/vsfedorenko/next-logger/commit/162e04cd34e0e51be066d604968c21c92ce4cda7))

- Update CHANGELOG.md ([`2150bfc`](https://github.com/vsfedorenko/next-logger/commit/2150bfc22c5e0b0be73ebd38dfaa14f470887620))

- Update CHANGELOG.md ([`cfd0461`](https://github.com/vsfedorenko/next-logger/commit/cfd0461c3019bcca0576dfb565aa86f87f86423b))

- Update CHANGELOG.md ([`cd4a600`](https://github.com/vsfedorenko/next-logger/commit/cd4a600490ddd0a663be6ac026504c9e48ca965b))

- Update CHANGELOG.md ([`fb1aca7`](https://github.com/vsfedorenko/next-logger/commit/fb1aca7e055dad784d98d0aac329598470e636aa))

- Update CHANGELOG.md ([`49a1f4f`](https://github.com/vsfedorenko/next-logger/commit/49a1f4f000633e62ff228d1791ae947d0eb360c6))

### Fixed


- Expose flush() on the Datadog reporter — buffered tail entries were lost at shutdown (#41) ([`e456385`](https://github.com/vsfedorenko/next-logger/commit/e456385167c43f0b72f1917bdfce014405697f21))
## [0.6.0](https://github.com/vsfedorenko/next-logger/releases/tag/v0.6.0) — 2026-08-14

### Added


- Add structured metadata (withMetadata + LOG_METADATA env) (#26) ([`9043e37`](https://github.com/vsfedorenko/next-logger/commit/9043e37dfbfa109f6e6f5354c38ad0f35167444f))

- Add Winston backend adapter (#27) ([`b4cf836`](https://github.com/vsfedorenko/next-logger/commit/b4cf836ba1bd8906ea4a7a6ba8e0f6bcb181371f))

- Bun workspaces monorepo — isolated e2e fixtures, pino e2e suite ([`64c7a10`](https://github.com/vsfedorenko/next-logger/commit/64c7a10c0594644ec166f856a811d5c1e9970917))

### Documentation


- Update CHANGELOG.md ([`2322a21`](https://github.com/vsfedorenko/next-logger/commit/2322a21cd5a7504c5092ee09a8a7904d2d2e0fb9))

- Update CHANGELOG.md ([`e5d5d99`](https://github.com/vsfedorenko/next-logger/commit/e5d5d99534468f01cda3dfa3df54ff75d4157895))

- Update CHANGELOG.md ([`71b4812`](https://github.com/vsfedorenko/next-logger/commit/71b48122a53986719ac0c12e531d3d37f88eeeea))

- Update CHANGELOG.md ([`532b119`](https://github.com/vsfedorenko/next-logger/commit/532b119650bafd7022a0920d1cd3a629c17ec00f))

- Update CHANGELOG.md ([`113ed0d`](https://github.com/vsfedorenko/next-logger/commit/113ed0d8d605b7cf7557b338235df9622a1a0337))

- Update CHANGELOG.md ([`bc1d926`](https://github.com/vsfedorenko/next-logger/commit/bc1d92684a6c84bfc08be8077a1afebd770d6c99))

- Update CHANGELOG.md ([`d5e3963`](https://github.com/vsfedorenko/next-logger/commit/d5e3963f0df3d2459e2d81a7460eb305f59ccce3))

### Fixed


- **ci:** Run vitest via root bin path (bun filter exec unsupported) ([`0cd87ac`](https://github.com/vsfedorenko/next-logger/commit/0cd87ac7028cf7a34d18355b40aa7dc8baa04e41))

- **ci:** Run vitest via bun x (workspace-local bin) ([`dece5a9`](https://github.com/vsfedorenko/next-logger/commit/dece5a94dc57f28b3c658dffbf2b768297abff7f))

- **ci:** Build before unit tests (pino-missing sandbox needs dist/) ([`1241816`](https://github.com/vsfedorenko/next-logger/commit/12418169d1532227e29a861648532ce8676cf073))
## [0.5.0](https://github.com/vsfedorenko/next-logger/releases/tag/v0.5.0) — 2026-08-14

### Added


- Add log sampling (LOG_SAMPLE_RATE) (#19) ([`d11a0f8`](https://github.com/vsfedorenko/next-logger/commit/d11a0f8d7d0e2f5fa08877e4cb896bb45543abdb))

- Add correlation IDs with automatic request ID propagation (#20) ([`a8e6395`](https://github.com/vsfedorenko/next-logger/commit/a8e639511b43222ddc46d60f891338e01c3026fd))

### Documentation


- Update CHANGELOG.md ([`b2c34d5`](https://github.com/vsfedorenko/next-logger/commit/b2c34d53ef72e57089747d0c039813f423d162f6))

- Update CHANGELOG.md ([`b776e37`](https://github.com/vsfedorenko/next-logger/commit/b776e373d262c8c81b339c935fddfb1d3d473882))

- Update CHANGELOG.md ([`b3b4416`](https://github.com/vsfedorenko/next-logger/commit/b3b4416d7ff50c2c810b1fa295cb3de6f3ea8f2e))

- Update CHANGELOG.md ([`18a813b`](https://github.com/vsfedorenko/next-logger/commit/18a813b3c81a3832fddadb8681db01fd26321976))

### Fixed


- Add backends subpath exports and sideEffects (#21) ([`6683512`](https://github.com/vsfedorenko/next-logger/commit/6683512c1a2d9461a14ddcafedc31de734e3a656))
## [0.4.0](https://github.com/vsfedorenko/next-logger/releases/tag/v0.4.0) — 2026-08-14

### Added


- Add request-scoped logger with AsyncLocalStorage (#17) ([`ca64679`](https://github.com/vsfedorenko/next-logger/commit/ca646799b53650e263ef038782c93a4ce9de70bf))

- Backend-agnostic architecture — pluggable logging adapters (#18) ([`8714ec4`](https://github.com/vsfedorenko/next-logger/commit/8714ec4965421c6793ba43986df3d11981216ab1))

### Documentation


- Update CHANGELOG.md ([`56bebfb`](https://github.com/vsfedorenko/next-logger/commit/56bebfbf4e6299a6f23361e2896c53bb0ac1c324))

- Update CHANGELOG.md ([`a497441`](https://github.com/vsfedorenko/next-logger/commit/a4974413ac9eed60e4b2e2df7a46dd49ece5dafd))

- Update CHANGELOG.md ([`c21f7e6`](https://github.com/vsfedorenko/next-logger/commit/c21f7e6a0082e1dc3f2afcba5ba5b84a0d821fa8))
## [0.3.0](https://github.com/vsfedorenko/next-logger/releases/tag/v0.3.0) — 2026-08-14

### Added


- Add redaction reporter for sensitive data filtering (#15) ([`f3c8475`](https://github.com/vsfedorenko/next-logger/commit/f3c847505ff4b3cd6a8444bbf38e6f08d9d21541))

- Add Pino reporter bridge (#16) ([`f42c3d3`](https://github.com/vsfedorenko/next-logger/commit/f42c3d3fa15e390aa11f8855c17562601f760462))

### CI


- Bump actions/setup-node from 6 to 7 (#4) ([`668f1fc`](https://github.com/vsfedorenko/next-logger/commit/668f1fc8b7613af01b5a41d5afd4609ed3081655))

- Add lint, typecheck, matrix testing, and coverage (#9) ([`42e781f`](https://github.com/vsfedorenko/next-logger/commit/42e781f867c400b06f5fb7e7fb8cfa493cb76b3b))

### Documentation


- Update CHANGELOG.md ([`cec32c0`](https://github.com/vsfedorenko/next-logger/commit/cec32c0314e17751066eb08323bbb40a7b63a9b1))

- Update CHANGELOG.md ([`edb98ab`](https://github.com/vsfedorenko/next-logger/commit/edb98ab9468fe8772709a7290a82507ae51cfef8))

- Update CHANGELOG.md ([`c86ff41`](https://github.com/vsfedorenko/next-logger/commit/c86ff41d9b38ae6c61d3ccf0b6f8e8ee1db37973))

- Update CHANGELOG.md ([`662893d`](https://github.com/vsfedorenko/next-logger/commit/662893da8bad19009fbca98af816843900c71bc6))

- Add GitHub Pages deployment with TypeDoc API reference (#8) ([`aa77f7a`](https://github.com/vsfedorenko/next-logger/commit/aa77f7a18ea2d5bd9ee1a676db35f47de8741411))

- Update CHANGELOG.md ([`54ea9c4`](https://github.com/vsfedorenko/next-logger/commit/54ea9c4cf46b130df84f96fc6be9e2be1a5890a9))

- Update CHANGELOG.md ([`31afb08`](https://github.com/vsfedorenko/next-logger/commit/31afb08c703b9888ca80ebfe2fb376871302491d))

- Update CHANGELOG.md ([`9067800`](https://github.com/vsfedorenko/next-logger/commit/9067800e104aa9e39d84cd0b6a259060d3388b1e))

- Update CHANGELOG.md ([`c50c0c1`](https://github.com/vsfedorenko/next-logger/commit/c50c0c1a58c127cb962a8b5817b3f2151891b190))

- SEO optimization — keywords, descriptions, discoverability (#14) ([`5235862`](https://github.com/vsfedorenko/next-logger/commit/5235862b8b19e24f9abcbb46c35cd58b999bbc28))

- Update CHANGELOG.md ([`b46f881`](https://github.com/vsfedorenko/next-logger/commit/b46f881ef8e59522c9f3dd3cbe68fbde50a81040))

- Update CHANGELOG.md ([`76f6cef`](https://github.com/vsfedorenko/next-logger/commit/76f6ceffb8d25a0cc5292ab239d30ac07d520670))

- Update CHANGELOG.md ([`964f141`](https://github.com/vsfedorenko/next-logger/commit/964f141a4b47b45ff4416faea33493274da4d18a))
## [0.2.1](https://github.com/vsfedorenko/next-logger/releases/tag/v0.2.1) — 2026-07-12

### CI


- Automate CHANGELOG.md via git-cliff on push to main ([`bf2fa67`](https://github.com/vsfedorenko/next-logger/commit/bf2fa67795be0ad03a0df04f82f97b39fa39563f))

### Documentation


- Update CHANGELOG.md ([`922fc70`](https://github.com/vsfedorenko/next-logger/commit/922fc70d68315a17f6561e6c69769b98d9cf4627))

- Update CHANGELOG.md ([`fc6c1ad`](https://github.com/vsfedorenko/next-logger/commit/fc6c1addb6c918ef5a3381b12fde990466fdbc38))

- Update CHANGELOG.md ([`34e5d76`](https://github.com/vsfedorenko/next-logger/commit/34e5d76869257bee38c77b644b85b14be4b3a2df))

- Update CHANGELOG.md ([`6c874f6`](https://github.com/vsfedorenko/next-logger/commit/6c874f68d80f6d67cf8284d562f8910f00203bb2))

- Update CHANGELOG.md ([`b799e83`](https://github.com/vsfedorenko/next-logger/commit/b799e833c427e8738f015d8a2009804ec2785e1b))

### Fixed


- Regenerate lockfile (missing @emnapi deps for vitest 4) ([`cbcf7d5`](https://github.com/vsfedorenko/next-logger/commit/cbcf7d5f68542519084d3d19758f97c7a1c8bcbd))

- Downgrade vitest to ^3.2.7 (v4 pulls @emnapi cross-platform deps) ([`580f206`](https://github.com/vsfedorenko/next-logger/commit/580f206feefeb2fb87927c39f3f04c4dacf04b3b))
## [0.2.0](https://github.com/vsfedorenko/next-logger/releases/tag/v0.2.0) — 2026-07-12

### Added


- Rewrite to withLogger() wrapper + console-sink interception ([`c54a3fd`](https://github.com/vsfedorenko/next-logger/commit/c54a3fd0d3d0bd1d5461b447ba9ed401297a75ed))

### Documentation


- Add npm badge, language chooser, and RU/ZH README translations ([`02d1c2e`](https://github.com/vsfedorenko/next-logger/commit/02d1c2e253cfc184e6dce202ef4c515c75ed08a3))
## [0.1.0](https://github.com/vsfedorenko/next-logger/releases/tag/v0.1.0) — 2026-07-12

### Added


- Initial release — universal logging kit for Next.js ([`8e23b9b`](https://github.com/vsfedorenko/next-logger/commit/8e23b9ba4f2c7ad08e91938a6bcdd684ad215169))

### CI


- Add npm publish workflow (release-triggered, provenance) ([`ec4e9f0`](https://github.com/vsfedorenko/next-logger/commit/ec4e9f0758885721eb0e0e2b5ec123f85bac64b6))

### Fixed


- Rename to @vsfedorenko/next-logger ([`a9338ae`](https://github.com/vsfedorenko/next-logger/commit/a9338aebc68ab27efa2a88e1be3e43dd03fe9552))

