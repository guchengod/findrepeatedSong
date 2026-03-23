package main

import (
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

func extractBigrams(s string) []string {
	runes := []rune(s)
	if len(runes) < 2 {
		return []string{s}
	}
	bigrams := make([]string, 0, len(runes)-1)
	for i := 0; i < len(runes)-1; i++ {
		bigrams = append(bigrams, string(runes[i:i+2]))
	}
	return bigrams
}

type analyzeItem struct {
	ID      uint
	Bigrams []string
}

func doAnalyze(similarityThreshold float64) {
	broadcastProgress("analyze", gin.H{"isRunning": true, "percent": 0, "status": "Validating files..."})
	
	// Optional: You could do a quick check here, but doScan already handles this.
	// Let's ensure we only process non-deleted ones.
	
	broadcastProgress("analyze", gin.H{"isRunning": true, "percent": 0, "status": "Loading data..."})
	defer broadcastProgress("analyze", gin.H{"isRunning": false, "percent": 100, "status": "Done"})

	var items []struct {
		ID             uint
		NormalizedName string
	}
	db.Model(&SongFile{}).Where("deleted = ?", false).Select("id", "normalized_name").Find(&items)

	if len(items) == 0 {
		return
	}

	broadcastProgress("analyze", gin.H{"isRunning": true, "percent": 0, "status": "Building index..."})

	data := make([]analyzeItem, len(items))
	invertedIndex := make(map[string][]int)

	for i, item := range items {
		bg := extractBigrams(item.NormalizedName)
		data[i] = analyzeItem{ID: item.ID, Bigrams: bg}
		// limit indexing common bigrams? we can just index all
		for _, b := range bg {
			invertedIndex[b] = append(invertedIndex[b], i)
		}
	}

	broadcastProgress("analyze", gin.H{"isRunning": true, "percent": 0, "status": "Comparing items..."})

	// Union-Find structure
	parent := make([]int, len(data))
	for i := range parent {
		parent[i] = i
	}

	var find func(int) int
	find = func(i int) int {
		if parent[i] == i {
			return i
		}
		parent[i] = find(parent[i])
		return parent[i]
	}

	union := func(i, j int) {
		rootI := find(i)
		rootJ := find(j)
		if rootI != rootJ {
			parent[rootI] = rootJ
		}
	}

	totalItems := len(data)
	for i := 0; i < totalItems; i++ {
		if i%1000 == 0 {
			percent := (i * 100) / totalItems
			broadcastProgress("analyze", gin.H{"isRunning": true, "percent": percent, "status": "Comparing items..."})
		}

		matches := make(map[int]int)
		for _, bg := range data[i].Bigrams {
			for _, j := range invertedIndex[bg] {
				if j > i { // only compare j > i
					matches[j]++
				}
			}
		}

		lenI := len(data[i].Bigrams)
		for j, intersect := range matches {
			lenJ := len(data[j].Bigrams)
			dice := float64(2*intersect) / float64(lenI+lenJ)
			if dice >= similarityThreshold {
				union(i, j)
			}
		}
	}

	broadcastProgress("analyze", gin.H{"isRunning": true, "percent": 100, "status": "Saving groups..."})

	groups := make(map[int][]uint)
	for i := 0; i < totalItems; i++ {
		root := find(i)
		groups[root] = append(groups[root], data[i].ID)
	}

	db.Transaction(func(tx *gorm.DB) error {
		// Reset all existing group ids
		tx.Model(&SongFile{}).Where("1=1").Update("group_id", "")

		for _, g := range groups {
			if len(g) > 1 {
				// Found duplicate group
				u := uuid.New().String()
				tx.Model(&SongFile{}).Where("id IN ?", g).Update("group_id", u)
			}
		}
		return nil
	})
}
