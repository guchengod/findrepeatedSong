package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"go.senan.xyz/taglib"
)

var (
	mbClient = &http.Client{Timeout: 10 * time.Second}
	mbLastReq = time.Now()
	mbMu sync.Mutex
)

type MBRecordingResponse struct {
	Recordings []struct {
		Title  string `json:"title"`
		Length int    `json:"length"` // length in ms
		ArtistCredit []struct {
			Name string `json:"name"`
		} `json:"artist-credit"`
		Releases []struct {
			Title string `json:"title"`
			ID    string `json:"id"`
		} `json:"releases"`
	} `json:"recordings"`
}

func mbRequest(uri string) ([]byte, error) {
	mbMu.Lock()
	defer mbMu.Unlock()

	// 1 request per second rule
	elapsed := time.Since(mbLastReq)
	if elapsed < time.Second {
		time.Sleep(time.Second - elapsed)
	}

	req, _ := http.NewRequest("GET", uri, nil)
	req.Header.Set("User-Agent", "FindRepeatedSong/1.0.0 ( contact@example.com )")
	req.Header.Set("Accept", "application/json")

	resp, err := mbClient.Do(req)
	mbLastReq = time.Now()
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("MusicBrainz API error: %d", resp.StatusCode)
	}

	return io.ReadAll(resp.Body)
}

func searchMetadata(titles []string, localDuration float64) (newArtist, newAlbum, newTitle string, err error) {
	if len(titles) == 0 {
		return "", "", "", nil
	}

	bestMinDiff := 999999.0
	var finalRes struct {
		artist, album, title string
	}

	// Try each candidate title
	for _, candTitle := range titles {
		if candTitle == "" {
			continue
		}

		// Build a list of search attempts for this candidate
		type searchJob struct{ a, t string }
		jobs := []searchJob{{a: "", t: candTitle}}

		// If the candidate looks like "Artist - Title", try structured search
		seps := []string{"-", "——"}
		for _, sep := range seps {
			if strings.Contains(candTitle, sep) {
				parts := strings.Split(candTitle, sep)
				if len(parts) == 2 {
					p1 := strings.TrimSpace(parts[0])
					p2 := strings.TrimSpace(parts[1])
					jobs = append(jobs, searchJob{a: p1, t: p2})
					jobs = append(jobs, searchJob{a: p2, t: p1}) // Try reverse
				}
			}
		}

		for _, job := range jobs {
			res, err := doMBSearch(job.a, job.t)
			if err != nil {
				continue
			}

			if len(res.Recordings) > 0 {
				for _, rec := range res.Recordings {
					mbDuration := float64(rec.Length) / 1000.0
					diff := math.Abs(mbDuration - localDuration)

					// Matching criteria:
					// 1. If local duration exists, diff must be small (< 10s)
					// 2. If no local duration, take the first one as fallback
					if localDuration > 0 && diff < 10.0 {
						if diff < bestMinDiff {
							bestMinDiff = diff
							finalRes.title = rec.Title
							if len(rec.ArtistCredit) > 0 {
								finalRes.artist = rec.ArtistCredit[0].Name
							}
							if len(rec.Releases) > 0 {
								finalRes.album = rec.Releases[0].Title
							}
						}
					} else if localDuration == 0 {
						if finalRes.title == "" {
							finalRes.title = rec.Title
							if len(rec.ArtistCredit) > 0 {
								finalRes.artist = rec.ArtistCredit[0].Name
							}
							if len(rec.Releases) > 0 {
								finalRes.album = rec.Releases[0].Title
							}
						}
					}
				}
			}
			// If we found a very good match, stop trying other jobs for this candidate
			if bestMinDiff < 2.0 {
				break
			}
		}
		
		// If we found a good match for this candidate, stop trying other candidates
		if bestMinDiff < 5.0 {
			break
		}
	}

	if finalRes.title != "" {
		return finalRes.artist, finalRes.album, finalRes.title, nil
	}

	return "", "", "", nil
}

func writeMetadataToFile(path, artist, album, title string) error {
	tags := map[string][]string{
		"ARTIST": {artist},
		"ALBUM":  {album},
		"TITLE":  {title},
	}
	err := taglib.WriteTags(path, tags, 0)
	if err == nil {
		return nil
	}

	// Fallback to ffmpeg for formats like WAV where taglib might fail in Wasm
	log.Printf("taglib failed for %s, falling back to ffmpeg: %v", path, err)
	
	tmpPath := path + ".tmp" + filepath.Ext(path)
	cmd := exec.Command("ffmpeg", "-y", "-i", path,
		"-metadata", "artist="+artist,
		"-metadata", "album="+album,
		"-metadata", "title="+title,
		"-codec", "copy", tmpPath)

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("ffmpeg error: %v", err)
	}

	if err := os.Rename(tmpPath, path); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("rename error: %v", err)
	}

	return nil
}

func getCandidateTitles(filename string) []string {
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

	// New Rule: Exclude content in parentheses/brackets (e.g., "(Artist)", "[Special]")
	bracketRe := regexp.MustCompile(`[\(\[\{].*?[\)\]\}]`)
	nameClean := bracketRe.ReplaceAllString(name, "")
	nameClean = strings.TrimSpace(nameClean)

	// We use both the version with brackets and without as candidates
	candidates := []string{name}
	if nameClean != "" && nameClean != name {
		candidates = append(candidates, nameClean)
	}

	// Split by -, ., and space as requested
	separators := []string{"-", "——", ".", " "}

	// Add parts from both the raw name and the cleaned name
	toSplit := []string{name, nameClean}
	for _, s := range toSplit {
		if s == "" { continue }
		for _, sep := range separators {
			if strings.Contains(s, sep) {
				parts := strings.Split(s, sep)
				for _, p := range parts {
					p = strings.TrimSpace(p)
					// Further clean parts from brackets if they still have any
					p = bracketRe.ReplaceAllString(p, "")
					p = strings.TrimSpace(p)
					if p != "" && len(p) > 1 {
						candidates = append(candidates, p)
					}
				}
			}
		}
	}

	// De-duplicate
	unique := make(map[string]bool)
	var result []string
	for _, c := range candidates {
		if !unique[c] {
			unique[c] = true
			result = append(result, c)
		}
	}
	return result
}

func doMBSearch(artist, title string) (MBRecordingResponse, error) {
	query := fmt.Sprintf("recording:\"%s\"", title)
	if artist != "" && artist != "Unknown Artist" {
		query = fmt.Sprintf("artist:\"%s\" AND recording:\"%s\"", artist, title)
	}

	u := fmt.Sprintf("https://musicbrainz.org/ws/2/recording?query=%s&fmt=json", url.QueryEscape(query))
	data, err := mbRequest(u)
	var res MBRecordingResponse
	if err != nil {
		return res, err
	}

	if err := json.Unmarshal(data, &res); err != nil {
		return res, err
	}
	return res, nil
}

func doComplete(rootPath string) {
	broadcastProgress("complete", gin.H{"isRunning": true, "processed": 0, "total": 0, "status": "Starting scan..."})
	defer broadcastProgress("complete", gin.H{"isRunning": false, "status": "Done"})

	processed := 0

	var walk func(path string)
	walk = func(path string) {
		entries, err := os.ReadDir(path)
		if err != nil {
			log.Println("ReadDir error:", err)
			return
		}

		for _, entry := range entries {
			fullPath := filepath.Join(path, entry.Name())
			if entry.IsDir() {
				walk(fullPath)
				continue
			}

			ext := strings.ToLower(filepath.Ext(entry.Name()))
			if !validExts[ext] {
				continue
			}

			// It's a valid music file. Extract local duration.
			_, _, _, duration := extractMetadata(fullPath)

			// Get candidate titles from filename
			candidates := getCandidateTitles(entry.Name())

			na, nal, nt, err := searchMetadata(candidates, duration)
			detailMsg := ""

			if err != nil {
				detailMsg = fmt.Sprintf("❌ [%s] 失败: %v", entry.Name(), err)
			} else if nt == "" {
				detailMsg = fmt.Sprintf("⚠️ [%s] 未找到匹配 (候选: %v)", entry.Name(), candidates)
			} else {
				// 1. Update database
				var song SongFile
				if err := db.Where("path = ?", fullPath).First(&song).Error; err == nil {
					song.Artist = na
					song.Album = nal
					song.Title = nt
					db.Save(&song)
				}
				// 2. Update physical file
				if err := writeMetadataToFile(fullPath, na, nal, nt); err != nil {
					detailMsg = fmt.Sprintf("✅ [%s] DB更新 -> %s - %s (文件写入失败: %v)", entry.Name(), na, nt, err)
				} else {
					detailMsg = fmt.Sprintf("✅ [%s] 成功更新文件 & DB -> %s - %s", entry.Name(), na, nt)
				}
			}

			processed++
			broadcastProgress("complete", gin.H{
				"isRunning": true,
				"processed": processed,
				"total": 0,
				"status": "Completing metadata...",
				"detail": detailMsg,
			})
		}
	}

	walk(rootPath)
}
