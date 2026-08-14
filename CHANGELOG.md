# Changelog

All notable changes to this project will be documented in this file.

## [0.1.2.0] - 2026-08-14

### Changed
- 默认服务端口从 8080 调整为 38491，并同步更新 Docker、飞牛 fnOS 与原生启动包。

## [0.1.1.0] - 2026-03-24

### Security
- Path traversal bypass in `apiBrowsePath` fixed via `filepath.Clean()` normalization
- Stats cache thundering herd prevented via mutex lock in `apiGetStats`
- WebSocket broadcast made non-blocking to prevent goroutine leaks in tests/CI

### Fixed
- Production black screen: replaced CJS `require()` of `qnn-react-cron` with ESM dynamic `import()`
- Scan interruption data loss: added async orphan recovery that un-deletes files whose paths still exist on disk
- N+1 query in `RefreshStats()` duplicate counting: replaced O(n) per-group queries with single SQL subquery
- Missing stats refresh after file/group deletion operations

### Added
- New frontend Dashboard with real-time mission tracking and metric cards
- `recoverOrphanedFiles()` for automatic recovery of accidentally deleted records

## [0.1.0.0] - 2026-03-24

### Added
- Organization workflow: move or copy songs to structured directory hierarchy (Artist/Album)
- Metadata completion: fetch metadata from MusicBrainz API and write to audio file tags
- Auto-delete strategies: quality-based and size-based automatic duplicate deletion
- Scheduler: cron-based scheduled tasks for scan, analyze, and auto-delete operations
- WebSocket progress tracking for all long-running operations
- Internationalization (i18n) support with Chinese and English languages
- Dark/light theme toggle

### Changed
- Enhanced scanner with depth configuration and batch processing for large music libraries
- Improved duplicate detection with configurable similarity threshold
- Refactored API endpoints with JSON request/response structure
- Updated frontend UI with Tailwind CSS v4 and shadcn-style components

### Fixed
- Fixed cross-device file move operations (fallback to copy+delete)
- Fixed metadata extraction for files without embedded tags

### Removed
- Legacy single-path scan mode (replaced with multi-path support)
