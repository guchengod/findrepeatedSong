package main

import (
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"

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

func doScan(rootPath string) {
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

	var walk func(path string, depth int)
	walk = func(path string, depth int) {
		if depth > 10 {
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

			file := SongFile{
				Path:           fullPath,
				Filename:       entry.Name(),
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
		DoUpdates: clause.AssignmentColumns([]string{"filename", "normalized_name", "size", "ext"}),
	}).Create(&batch)
}
