package main

import (
	"sync"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

var analyzeProgress struct {
	sync.RWMutex
	IsRunning bool
	Percent   int
	TotalMsg  string
}

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
	analyzeProgress.Lock()
	analyzeProgress.IsRunning = true
	analyzeProgress.Percent = 0
	analyzeProgress.TotalMsg = "Loading data..."
	analyzeProgress.Unlock()

	defer func() {
		analyzeProgress.Lock()
		analyzeProgress.IsRunning = false
		analyzeProgress.Percent = 100
		analyzeProgress.TotalMsg = "Done"
		analyzeProgress.Unlock()
	}()

	var items []struct {
		ID             uint
		NormalizedName string
	}
	db.Model(&SongFile{}).Where("deleted = ?", false).Select("id", "normalized_name").Find(&items)

	if len(items) == 0 {
		return
	}

	analyzeProgress.Lock()
	analyzeProgress.TotalMsg = "Building index..."
	analyzeProgress.Unlock()

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

	analyzeProgress.Lock()
	analyzeProgress.TotalMsg = "Comparing items..."
	analyzeProgress.Unlock()

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
			analyzeProgress.Lock()
			analyzeProgress.Percent = (i * 100) / totalItems
			analyzeProgress.Unlock()
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

	analyzeProgress.Lock()
	analyzeProgress.TotalMsg = "Saving groups..."
	analyzeProgress.Unlock()

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
