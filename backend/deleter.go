package main

import (
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"gorm.io/gorm"
	"github.com/gin-gonic/gin"
)

var (
	losslessExts = map[string]bool{
		// Mainstream Lossless
		".flac": true, ".wav": true, ".aiff": true, ".aif": true, ".alac": true,
		// Others / Audiophile
		".ape": true, ".wv": true, ".tak": true,
	}
)

func isLossless(ext string) bool {
	return losslessExts[ext]
}

func doAutoDelete(strategies []string) {
	broadcastProgress("auto_delete", gin.H{"isRunning": true, "percent": 0, "status": "Fetching groups..."})
	defer func() {
		broadcastProgress("auto_delete", gin.H{"isRunning": false, "percent": 100, "status": "Done"})
		refreshStats()
	}()

	if len(strategies) == 0 {
		var conf AppConfig
		if err := db.Where("key = ?", "default_delete_strategy").First(&conf).Error; err == nil {
			strategies = strings.Split(conf.Value, ",")
			for i := range strategies {
				strategies[i] = strings.TrimSpace(strategies[i])
			}
		} else {
			strategies = []string{"quality", "size_desc"}
		}
	}

	var allFiles []SongFile
	db.Where("group_id != '' AND deleted = ?", false).Find(&allFiles)

	groups := make(map[string][]SongFile)
	for _, f := range allFiles {
		groups[f.GroupID] = append(groups[f.GroupID], f)
	}

	totalGroups := len(groups)
	processed := 0

	if totalGroups == 0 {
		broadcastProgress("auto_delete", gin.H{"isRunning": false, "percent": 100, "status": "No groups to process"})
		return
	}

	db.Transaction(func(tx *gorm.DB) error {
		for _, files := range groups {
			processed++
			if processed%10 == 0 {
				percent := (processed * 100) / totalGroups
				broadcastProgress("auto_delete", gin.H{"isRunning": true, "percent": percent, "status": "Deleting..."})
			}

			if len(files) <= 1 {
				continue
			}

			// Multi-criteria sorting
			sort.Slice(files, func(i, j int) bool {
				for _, s := range strategies {
					switch s {
					case "quality":
						iL := isLossless(files[i].Ext)
						jL := isLossless(files[j].Ext)
						if iL != jL {
							return iL // i is lossless (true), j is not -> i comes first
						}
					case "size_desc":
						if files[i].Size != files[j].Size {
							return files[i].Size > files[j].Size
						}
					case "size_asc":
						if files[i].Size != files[j].Size {
							return files[i].Size < files[j].Size
						}
					}
				}
				return false
			})

			// Safety check: ensure the file we keep actually exists on disk.
			// If not, try the next one in the sorted list.
			keepIdx := -1
			for i := 0; i < len(files); i++ {
				if _, err := os.Stat(files[i].Path); err == nil {
					keepIdx = i
					break
				} else {
					// Mark as deleted in DB if not on disk anyway
					tx.Model(&SongFile{}).Where("id = ?", files[i].ID).Update("deleted", true)
				}
			}

			if keepIdx == -1 {
				log.Printf("Group %s: No files exist on disk, skipping", files[0].GroupID)
				continue
			}

			// Keep files[keepIdx], delete others
			for i := 0; i < len(files); i++ {
				if i == keepIdx {
					continue
				}

				f := files[i]
				// Extra safety: don't delete if it's the same physical path as the kept one
				if strings.EqualFold(filepath.Clean(f.Path), filepath.Clean(files[keepIdx].Path)) {
					continue
				}

				err := os.Remove(f.Path)
				if err != nil {
					if os.IsNotExist(err) {
						// File already gone — mark deleted in DB anyway
						tx.Model(&SongFile{}).Where("id = ?", f.ID).Update("deleted", true)
					} else {
						// Real error — file still exists, DO NOT mark as deleted
						log.Println("Error deleting file:", f.Path, err)
					}
					continue
				}
				tx.Model(&SongFile{}).Where("id = ?", f.ID).Update("deleted", true)
			}
		}
		return nil
	})
}

func doManualDelete(groupID string, keepID uint) {
	var files []SongFile
	db.Where("group_id = ? AND deleted = ?", groupID, false).Find(&files)

	if len(files) <= 1 {
		return
	}

	// Verify keepID exists in the active files of this group
	var keepFile *SongFile
	for i := range files {
		if files[i].ID == keepID {
			keepFile = &files[i]
			break
		}
	}

	if keepFile == nil {
		log.Printf("Manual delete ignored: keepID %d not found in active group %s", keepID, groupID)
		return
	}

	db.Transaction(func(tx *gorm.DB) error {
		for _, f := range files {
			if f.ID != keepID {
				// Extra safety: don't delete if it's the same physical path as the kept one
				if strings.EqualFold(filepath.Clean(f.Path), filepath.Clean(keepFile.Path)) {
					continue
				}

				err := os.Remove(f.Path)
				if err != nil {
					if os.IsNotExist(err) {
						// File already gone — mark deleted in DB anyway
						tx.Model(&SongFile{}).Where("id = ?", f.ID).Update("deleted", true)
					} else {
						// Real error — file still exists, DO NOT mark as deleted
						log.Println("Error deleting file:", f.Path, err)
					}
					continue
				}
				tx.Model(&SongFile{}).Where("id = ?", f.ID).Update("deleted", true)
			}
		}
		return nil
	})
}
