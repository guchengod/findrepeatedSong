package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

const lrclibAPIBase = "https://lrclib.net/api"

var (
	lyricsClient = &http.Client{Timeout: 15 * time.Second}
	lyricsJobMu  sync.Mutex
	lyricsActive bool
)

type lrclibLyrics struct {
	TrackName    string  `json:"trackName"`
	ArtistName   string  `json:"artistName"`
	AlbumName    string  `json:"albumName"`
	Duration     float64 `json:"duration"`
	PlainLyrics  string  `json:"plainLyrics"`
	SyncedLyrics string  `json:"syncedLyrics"`
}

type lyricTrack struct {
	Path     string
	Filename string
	Artist   string
	Album    string
	Title    string
	Duration float64
}

func startLyricsJob(path string) bool {
	lyricsJobMu.Lock()
	defer lyricsJobMu.Unlock()
	if lyricsActive {
		return false
	}
	lyricsActive = true
	go func() {
		defer func() {
			lyricsJobMu.Lock()
			lyricsActive = false
			lyricsJobMu.Unlock()
		}()
		doLyrics(path)
	}()
	return true
}

func lyricConfig(key, fallback string) string {
	var config AppConfig
	if err := db.Where("key = ?", key).First(&config).Error; err == nil && strings.TrimSpace(config.Value) != "" {
		return strings.TrimSpace(config.Value)
	}
	return fallback
}

func collectLyricTracks(rootPath string) []lyricTrack {
	tracks := make([]lyricTrack, 0)
	filepath.WalkDir(rootPath, func(path string, entry os.DirEntry, err error) error {
		if err != nil || entry == nil || entry.IsDir() || entry.Type()&os.ModeSymlink != 0 {
			return nil
		}
		if !validExts[strings.ToLower(filepath.Ext(entry.Name()))] {
			return nil
		}
		artist, album, title, duration := extractMetadata(path)
		tracks = append(tracks, lyricTrack{Path: path, Filename: entry.Name(), Artist: artist, Album: album, Title: title, Duration: duration})
		return nil
	})
	return tracks
}

func hasLocalLyrics(trackPath string) bool {
	base := strings.TrimSuffix(trackPath, filepath.Ext(trackPath))
	for _, extension := range []string{".lrc", ".LRC"} {
		if info, err := os.Stat(base + extension); err == nil && !info.IsDir() {
			return true
		}
	}
	return false
}

func lrclibRequest(path string, query url.Values, target interface{}) error {
	req, err := http.NewRequest(http.MethodGet, lrclibAPIBase+path+"?"+query.Encode(), nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", lyricConfig("lyrics_user_agent", "FindRepeatedSong/1.0.0"))
	response, err := lyricsClient.Do(req)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusNotFound {
		return os.ErrNotExist
	}
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("LRCLIB API error: %d", response.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, 2<<20))
	if err != nil {
		return err
	}
	return json.Unmarshal(body, target)
}

func lookupLRCLIB(track lyricTrack) (lrclibLyrics, error) {
	query := url.Values{"track_name": {track.Title}}
	if track.Artist != "" && track.Artist != "Unknown Artist" {
		query.Set("artist_name", track.Artist)
	}
	if track.Album != "" && track.Album != "Unknown Album" {
		query.Set("album_name", track.Album)
	}
	if track.Duration > 0 {
		query.Set("duration", fmt.Sprintf("%d", int(track.Duration*1000)))
	}
	var exact lrclibLyrics
	if err := lrclibRequest("/get", query, &exact); err == nil {
		return exact, nil
	}

	searchQuery := url.Values{"track_name": {track.Title}}
	if track.Artist != "" && track.Artist != "Unknown Artist" {
		searchQuery.Set("artist_name", track.Artist)
	}
	var candidates []lrclibLyrics
	if err := lrclibRequest("/search", searchQuery, &candidates); err != nil {
		return lrclibLyrics{}, err
	}
	if len(candidates) == 0 {
		return lrclibLyrics{}, os.ErrNotExist
	}
	best := candidates[0]
	if track.Duration > 0 {
		bestDifference := absDuration(best.Duration - track.Duration)
		for _, candidate := range candidates[1:] {
			if difference := absDuration(candidate.Duration - track.Duration); difference < bestDifference {
				best, bestDifference = candidate, difference
			}
		}
		if bestDifference > 12 {
			return lrclibLyrics{}, os.ErrNotExist
		}
	}
	return best, nil
}

func absDuration(value float64) float64 {
	if value < 0 {
		return -value
	}
	return value
}

func lyricFileContent(track lyricTrack, lyrics lrclibLyrics) (string, bool, error) {
	if content := strings.TrimSpace(lyrics.SyncedLyrics); content != "" {
		return content + "\n", true, nil
	}
	if content := strings.TrimSpace(lyrics.PlainLyrics); content != "" {
		return fmt.Sprintf("[ti:%s]\n[ar:%s]\n[al:%s]\n\n%s\n", track.Title, track.Artist, track.Album, content), false, nil
	}
	return "", false, errors.New("lyrics response is empty")
}

func writeLyricsSidecar(trackPath, content string) (string, error) {
	lyricsPath := strings.TrimSuffix(trackPath, filepath.Ext(trackPath)) + ".lrc"
	if hasLocalLyrics(trackPath) {
		return lyricsPath, os.ErrExist
	}
	temporary, err := os.CreateTemp(filepath.Dir(lyricsPath), ".findrepeatedsong-lyrics-*.tmp")
	if err != nil {
		return "", err
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if _, err := temporary.WriteString(content); err != nil {
		temporary.Close()
		return "", err
	}
	if err := temporary.Chmod(0644); err != nil {
		temporary.Close()
		return "", err
	}
	if err := temporary.Close(); err != nil {
		return "", err
	}
	if err := os.Rename(temporaryPath, lyricsPath); err != nil {
		return "", err
	}
	return lyricsPath, nil
}

func saveLyricsRecord(track lyricTrack, lyricsPath, status, message string, synced bool) {
	record := LyricsRecord{TrackPath: track.Path}
	db.Where("track_path = ?", track.Path).Assign(LyricsRecord{
		LyricsPath:  lyricsPath,
		Provider:    "lrclib",
		Synced:      synced,
		Status:      status,
		Message:     message,
		CompletedAt: time.Now(),
	}).FirstOrCreate(&record)
}

func doLyrics(rootPath string) {
	tracks := collectLyricTracks(rootPath)
	broadcastProgress("lyrics", gin.H{"isRunning": true, "processed": 0, "total": len(tracks), "status": "正在检查本地歌词…"})
	defer broadcastProgress("lyrics", gin.H{"isRunning": false, "processed": len(tracks), "total": len(tracks), "status": "歌词补全完成"})

	if lyricConfig("lyrics_provider", "lrclib") != "lrclib" {
		broadcastProgress("lyrics", gin.H{"isRunning": false, "processed": 0, "total": len(tracks), "status": "当前歌词源尚未实现"})
		return
	}
	for index, track := range tracks {
		processed := index + 1
		if hasLocalLyrics(track.Path) {
			message := fmt.Sprintf("⏭️ [%s] 已保留本地歌词", track.Filename)
			saveLyricsRecord(track, strings.TrimSuffix(track.Path, filepath.Ext(track.Path))+".lrc", "skipped", message, false)
			broadcastProgress("lyrics", gin.H{"isRunning": true, "processed": processed, "total": len(tracks), "status": "正在检查本地歌词…", "detail": message})
			continue
		}

		lyrics, err := lookupLRCLIB(track)
		if err != nil {
			message := fmt.Sprintf("⚠️ [%s] 未找到可用歌词", track.Filename)
			saveLyricsRecord(track, "", "not_found", message, false)
			broadcastProgress("lyrics", gin.H{"isRunning": true, "processed": processed, "total": len(tracks), "status": "正在从 LRCLIB 匹配歌词…", "detail": message})
			continue
		}
		content, synced, err := lyricFileContent(track, lyrics)
		if err != nil {
			message := fmt.Sprintf("⚠️ [%s] 歌词内容为空", track.Filename)
			saveLyricsRecord(track, "", "empty", message, false)
			broadcastProgress("lyrics", gin.H{"isRunning": true, "processed": processed, "total": len(tracks), "status": "正在写入歌词…", "detail": message})
			continue
		}
		lyricsPath, err := writeLyricsSidecar(track.Path, content)
		if err != nil {
			message := fmt.Sprintf("❌ [%s] 无法写入歌词：%v", track.Filename, err)
			saveLyricsRecord(track, lyricsPath, "failed", message, false)
			broadcastProgress("lyrics", gin.H{"isRunning": true, "processed": processed, "total": len(tracks), "status": "正在写入歌词…", "detail": message})
			continue
		}
		message := fmt.Sprintf("✅ [%s] 已保存 %s", track.Filename, filepath.Base(lyricsPath))
		saveLyricsRecord(track, lyricsPath, "completed", message, synced)
		broadcastProgress("lyrics", gin.H{"isRunning": true, "processed": processed, "total": len(tracks), "status": "正在写入歌词…", "detail": message})
	}
}
