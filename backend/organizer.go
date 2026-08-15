package main

import (
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"golang.org/x/text/encoding/simplifiedchinese"
	"golang.org/x/text/unicode/norm"
)

var (
	lrcExts = []string{".lrc", ".txt", ".srt", ".ass", ".vtt"}
)

func doOrganize(targetRoot string, mode string, selectedPaths ...string) { // mode: "move" or "copy"
	broadcastProgress("organize", gin.H{"isRunning": true, "processed": 0, "total": 0, "status": "Initializing..."})
	defer func() {
		broadcastProgress("organize", gin.H{"isRunning": false, "status": "Done"})
		refreshStats()
	}()

	var songs []SongFile
	if err := db.Where("deleted = ?", false).Find(&songs).Error; err != nil {
		log.Println("Error fetching songs for organization:", err)
		return
	}
	if len(selectedPaths) > 0 {
		selected := make(map[string]struct{}, len(selectedPaths))
		for _, path := range selectedPaths {
			selected[filepath.Clean(path)] = struct{}{}
		}
		filtered := make([]SongFile, 0, len(songs))
		for _, song := range songs {
			cleanSongPath := filepath.Clean(song.Path)
			for selectedPath := range selected {
				if cleanSongPath == selectedPath || strings.HasPrefix(cleanSongPath, selectedPath+string(os.PathSeparator)) {
					filtered = append(filtered, song)
					break
				}
			}
		}
		songs = filtered
	}

	total := len(songs)
	processed := 0
	broadcastProgress("organize", gin.H{"isRunning": true, "processed": 0, "total": total, "status": "Organizing..."})

	for _, song := range songs {
		if _, err := os.Stat(song.Path); os.IsNotExist(err) {
			continue
		}

		// Sanitize paths
		artist := sanitizeFolderName(song.Artist)
		album := sanitizeFolderName(song.Album)

		targetDir := filepath.Join(targetRoot, artist, album)
		os.MkdirAll(targetDir, 0755)

		oldPath := song.Path
		newSongPath := filepath.Join(targetDir, song.Filename)

		if mode == "move" {
			if err := moveFile(oldPath, newSongPath); err != nil {
				continue
			}
			moveLyrics(oldPath, targetDir, song.Filename, "move")
			song.Path = newSongPath
			db.Save(&song)
		} else {
			if err := copyFile(oldPath, newSongPath); err != nil {
				continue
			}
			moveLyrics(oldPath, targetDir, song.Filename, "copy")
			// In copy mode, we don't necessarily update the path in DB unless we want to track the new one
		}

		processed++
		if processed%10 == 0 {
			broadcastProgress("organize", gin.H{"isRunning": true, "processed": processed, "total": total, "status": "Organizing..."})
		}
	}
}

func sanitizeFolderName(name string) string {
	name = normalizeFolderNameText(name)
	invalid := []string{"<", ">", ":", "\"", "/", "\\", "|", "?", "*"}
	for _, char := range invalid {
		name = strings.ReplaceAll(name, char, "_")
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return "Unknown"
	}
	return name
}

// normalizeFolderNameText makes legacy Chinese metadata safe for use in paths.
// Modern tags are UTF-8, but older ID3v1/ID3v2 tags are commonly GBK encoded.
func normalizeFolderNameText(name string) string {
	if !utf8.ValidString(name) {
		if decoded, err := simplifiedchinese.GBK.NewDecoder().String(name); err == nil && utf8.ValidString(decoded) {
			name = decoded
		} else {
			name = strings.ToValidUTF8(name, "")
		}
	}

	return norm.NFC.String(name)
}

func moveFile(sourcePath, destPath string) error {
	if sourcePath == destPath {
		return nil
	}
	err := os.Rename(sourcePath, destPath)
	if err == nil {
		return nil
	}
	return crossDeviceMove(sourcePath, destPath)
}

func copyFile(sourcePath, destPath string) error {
	if sourcePath == destPath {
		return nil
	}
	input, err := os.Open(sourcePath)
	if err != nil {
		return err
	}
	defer input.Close()

	output, err := os.Create(destPath)
	if err != nil {
		return err
	}
	defer output.Close()

	_, err = io.Copy(output, input)
	return err
}

func crossDeviceMove(sourcePath, destPath string) error {
	if err := copyFile(sourcePath, destPath); err != nil {
		return err
	}
	return os.Remove(sourcePath)
}

func moveLyrics(oldSongPath, targetDir, songFilename string, mode string) {
	oldDir := filepath.Dir(oldSongPath)
	baseName := strings.TrimSuffix(songFilename, filepath.Ext(songFilename))

	files, _ := os.ReadDir(oldDir)
	for _, f := range files {
		if f.IsDir() {
			continue
		}
		ext := strings.ToLower(filepath.Ext(f.Name()))
		isLrc := false
		for _, lrcExt := range lrcExts {
			if ext == lrcExt {
				isLrc = true
				break
			}
		}

		if isLrc {
			fBaseName := strings.TrimSuffix(f.Name(), ext)
			if strings.EqualFold(fBaseName, baseName) {
				oldLrcPath := filepath.Join(oldDir, f.Name())
				newLrcPath := filepath.Join(targetDir, f.Name())
				if mode == "move" {
					moveFile(oldLrcPath, newLrcPath)
				} else {
					copyFile(oldLrcPath, newLrcPath)
				}
			}
		}
	}
}
