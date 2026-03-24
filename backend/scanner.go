package main

import (
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"go.senan.xyz/taglib"
	"gorm.io/gorm/clause"
)

func getDurationViaFFprobe(path string) float64 {
	cmd := exec.Command("ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path)
	out, err := cmd.Output()
	if err != nil {
		return 0
	}
	s := strings.TrimSpace(string(out))
	d, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0
	}
	return d
}

var (
	validExts = map[string]bool{
		// Mainstream Lossy
		".mp3": true, ".m4a": true, ".aac": true, ".ogg": true, ".opus": true, ".wma": true,
		// Mainstream Lossless
		".flac": true, ".wav": true, ".aiff": true, ".aif": true,
		// Others / Audiophile
		".ape": true, ".wv": true, ".tak": true,
	}
	cleanRe = regexp.MustCompile(`[^\p{L}\p{N}]+`) // Only letters and numbers
)

func extractFromFilename(filename string) (artist, title string) {
	ext := filepath.Ext(filename)
	name := strings.TrimSuffix(filename, ext)

	// Clean up index patterns like "01. " or "01 - " or "01 "
	indexRe := regexp.MustCompile(`^(\d+)[.\-\s]+\s*`)
	if match := indexRe.FindStringSubmatch(name); match != nil {
		name = name[len(match[0]):]
	}

	// Rule 8: Index.Artist-Title_Time.ext (Index already handled)
	timeRe := regexp.MustCompile(`_(\d+:\d+|\d+)$`)
	if match := timeRe.FindStringSubmatch(name); match != nil {
		name = name[:len(name)-len(match[0])]
	}

	// Remove brackets for cleaner split
	bracketRe := regexp.MustCompile(`[\(\[\{].*?[\)\]\}]`)
	nameClean := bracketRe.ReplaceAllString(name, " ")

	// Check for separators
	sep := "-"
	if strings.Contains(nameClean, "——") {
		sep = "——"
	} else if !strings.Contains(nameClean, "-") && strings.Contains(nameClean, ".") {
		sep = "."
	}

	if strings.Contains(nameClean, sep) {
		parts := strings.Split(nameClean, sep)
		for i := range parts {
			parts[i] = strings.TrimSpace(parts[i])
		}

		if len(parts) >= 3 {
			// Rule 2/5: Index-Artist-Title-原唱 (Index already handled)
			artist = parts[0]
			title = parts[1]
		} else if len(parts) == 2 {
			// Rule 1, 9: Artist-Title or Title-Artist
			artist = parts[0]
			title = parts[1]
		}
	} else {
		// Rule 4, 6: Index.Title or Title (Index already handled)
		title = strings.TrimSpace(nameClean)
	}

	return artist, title
}

func extractMetadata(path string) (artist, album, title string, duration float64) {
	filename := filepath.Base(path)
	
	tags, _ := taglib.ReadTags(path)
	props, _ := taglib.ReadProperties(path)

	if tags != nil {
		if v, ok := tags["ARTIST"]; ok && len(v) > 0 { artist = v[0] }
		if v, ok := tags["ALBUM"]; ok && len(v) > 0 { album = v[0] }
		if v, ok := tags["TITLE"]; ok && len(v) > 0 { title = v[0] }
	}
	duration = props.Length.Seconds()

	fa, ft := extractFromFilename(filename)

	if artist == "" || artist == "Unknown Artist" {
		if fa != "" {
			artist = fa
		} else {
			artist = "Unknown Artist"
		}
	}

	if title == "" || title == filename {
		if ft != "" {
			title = ft
		} else {
			title = filename
		}
	}

	if album == "" {
		album = "Unknown Album"
	}

	if duration == 0 {
		duration = getDurationViaFFprobe(path)
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
	broadcastProgress("scan", gin.H{"isRunning": true, "scanned": 0, "status": "Cleaning old records..."})
	// Mark all existing records as deleted before scan
	db.Model(&SongFile{}).Where("1=1").Update("deleted", true)

	broadcastProgress("scan", gin.H{"isRunning": true, "scanned": 0, "status": "Starting scan..."})
	defer broadcastProgress("scan", gin.H{"isRunning": false, "status": "Scan finished"})

	scanned := 0
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

				artist, album, title, duration := extractMetadata(fullPath)

				file := SongFile{
					Path:           fullPath,
					Filename:       entry.Name(),
					Artist:         artist,
					Album:          album,
					Title:          title,
					NormalizedName: normalized,
					Duration:       duration,
					Size:           info.Size(),
					Ext:            ext,
				}
				batch = append(batch, file)

				scanned++
				if scanned%100 == 0 {
					broadcastProgress("scan", gin.H{"isRunning": true, "scanned": scanned, "status": "Scanning..."})
				}

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
	broadcastProgress("scan", gin.H{"isRunning": true, "scanned": scanned, "status": "Scan finished, recovering orphans..."})
	// Async orphan cleanup: un-delete records whose files still exist on disk.
	// If the scan was interrupted, files that were marked deleted may still be present.
	go recoverOrphanedFiles()
	refreshStats()
}

// recoverOrphanedFiles finds deleted SongFile records whose files still exist on disk
// and un-deletes them. Runs asynchronously after scan to handle interrupted scans.
func recoverOrphanedFiles() {
	var deleted []SongFile
	db.Where("deleted = ?", true).Find(&deleted)
	recovered := 0
	for _, f := range deleted {
		if _, err := os.Stat(f.Path); err == nil {
			// File still exists — un-delete it
			db.Model(&SongFile{}).Where("id = ?", f.ID).Update("deleted", false)
			recovered++
		}
	}
	if recovered > 0 {
		log.Printf("recoverOrphanedFiles: recovered %d files", recovered)
		refreshStats()
	}
}

func saveBatch(batch []SongFile) {
	if len(batch) == 0 {
		return
	}
	db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "path"}},
		DoUpdates: clause.AssignmentColumns([]string{"filename", "artist", "album", "title", "normalized_name", "duration", "size", "ext", "deleted"}),
	}).Create(&batch)
}

