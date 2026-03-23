# Changelog

All notable changes to this project will be documented in this file.

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
