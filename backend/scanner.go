package main

import (
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"

	"github.com/dhowden/tag"
	"gorm.io/gorm/clause"
)

var (
	validExts = map[string]bool{
		".mp3": true, ".flac": true, ".wav": true, ".ape": true,
		".m4a": true, ".aac": true, ".ogg": true, ".wma": true,
	}
	cleanRe = regexp.MustCompile(`[^\p{L}\p{N}]+`) // Only letters and numbers

	scanProgress struct {
		sync.RWMutex
		IsRunning bool
		Scanned   int
		TotalMsg  string
	}
)

func extractMetadata(path string) (artist, album, title string) {
	f, err := os.Open(path)
	if err != nil {
		return "Unknown Artist", "Unknown Album", filepath.Base(path)
	}
	defer f.Close()

	m, err := tag.ReadFrom(f)
	if err != nil {
		return "Unknown Artist", "Unknown Album", filepath.Base(path)
	}

	artist = m.Artist()
	album = m.Album()
	title = m.Title()

	if artist == "" {
		artist = "Unknown Artist"
	}
	if album == "" {
		album = "Unknown Album"
	}
	if title == "" {
		title = filepath.Base(path)
	}
	return
}

func normalizeName(name string) string {
	ext := filepath.Ext(name)
	nameWithoutExt := strings.TrimSuffix(name, ext)
	nameWithoutExt = strings.ToLower(nameWithoutExt)
	
	// Remove common tags
	tags := []string{"320k", "official", "audio", "high", "res", "remastered", "live", "edit"}
	for _, t := range tags {
		nameWithoutExt = strings.ReplaceAll(nameWithoutExt, t, "")
	}
	
	cleaned := cleanRe.ReplaceAllString(nameWithoutExt, "")
	return cleaned
}

func doScan(rootPaths []string) {
	scanProgress.Lock()
	scanProgress.IsRunning = true
	scanProgress.Scanned = 0
	scanProgress.TotalMsg = "Scanning..."
	scanProgress.Unlock()

	defer func() {
		scanProgress.Lock()
		scanProgress.IsRunning = false
		scanProgress.TotalMsg = "Done"
		scanProgress.Unlock()
	}()

	batchSize := 1000
	var batch []SongFile

	maxDepth := 10
	var depthConf AppConfig
	if err := db.Where("key = ?", "scan_depth").First(&depthConf).Error; err == nil {
		if d, err := strconv.Atoi(depthConf.Value); err == nil {
			maxDepth = d
		}
	}

	for _, rootPath := range rootPaths {
		if rootPath == "" { continue }
		
		var walk func(path string, depth int)
		walk = func(path string, depth int) {
			if depth > maxDepth {
				return
			}
			entries, err := os.ReadDir(path)
			if err != nil {
				log.Println("ReadDir error:", err)
				return
			}

			for _, entry := range entries {
				fullPath := filepath.Join(path, entry.Name())
				if entry.IsDir() {
					walk(fullPath, depth+1)
					continue
				}

				ext := strings.ToLower(filepath.Ext(entry.Name()))
				if !validExts[ext] {
					continue
				}

				info, err := entry.Info()
				if err != nil {
					continue
				}

				normalized := normalizeName(entry.Name())
				if normalized == "" {
					continue // Skip if name is completely empty after clean
				}

				artist, album, title := extractMetadata(fullPath)

				file := SongFile{
					Path:           fullPath,
					Filename:       entry.Name(),
					Artist:         artist,
					Album:          album,
					Title:          title,
					NormalizedName: normalized,
					Size:           info.Size(),
					Ext:            ext,
				}
				batch = append(batch, file)

				scanProgress.Lock()
				scanProgress.Scanned++
				scanProgress.Unlock()

				if len(batch) >= batchSize {
					saveBatch(batch)
					batch = batch[:0]
				}
			}
		}

		walk(rootPath, 1)
	}

	if len(batch) > 0 {
		saveBatch(batch)
	}
}

func saveBatch(batch []SongFile) {
	if len(batch) == 0 {
		return
	}
	db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "path"}},
		DoUpdates: clause.AssignmentColumns([]string{"filename", "artist", "album", "title", "normalized_name", "size", "ext"}),
	}).Create(&batch)
}
