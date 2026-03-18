package main

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func TestRealWorldPipeline(t *testing.T) {
	// 1. Setup real DB file for integration test
	dbFile := "data/test_songs.db"
	os.Remove(dbFile) // Start fresh
	os.MkdirAll("data", 0755)
	
	var err error
	db, err = gorm.Open(sqlite.Open(dbFile), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	db.AutoMigrate(&SongFile{})

	// 2. Generate dummy data in dummy_music
	testDir := "../dummy_music_test"
	os.RemoveAll(testDir)
	os.MkdirAll(testDir, 0755)
	defer os.RemoveAll(testDir)

	// Group 1: 10 duplicates, mix of mp3 and flac
	// We want to keep the FLAC one (quality strategy)
	for i := 1; i <= 10; i++ {
		ext := ".mp3"
		size := int64(1024 * i)
		if i == 5 {
			ext = ".flac" // This should be kept
			size = 5000000
		}
		path := filepath.Join(testDir, fmt.Sprintf("song_A_%d%s", i, ext))
		os.WriteFile(path, make([]byte, size), 0644)
	}

	// Group 2: 5 duplicates, all mp3, different sizes
	// We want to keep the largest one (size_desc strategy)
	for i := 1; i <= 5; i++ {
		size := int64(1000 * i)
		path := filepath.Join(testDir, fmt.Sprintf("song_B_%d.mp3", i))
		os.WriteFile(path, make([]byte, size), 0644)
	}

	// Group 3: Unique files (very different names to avoid grouping)
	uniqueNames := []string{
		"Yesterday.mp3", "LetItBe.mp3", "Imagine.mp3", "BohemianRhapsody.mp3",
		"StairwayToHeaven.mp3", "HotelCalifornia.mp3", "SweetChildOMine.mp3",
		"SmellsLikeTeenSpirit.mp3", "PurpleHaze.mp3", "LikeARollingStone.mp3",
		"BillieJean.mp3", "Thriller.mp3", "BeatIt.mp3", "Bad.mp3",
		"SmoothCriminal.mp3", "BlackOrWhite.mp3", "ManInTheMirror.mp3",
		"EarthSong.mp3", "HealTheWorld.mp3", "TheyDontCareAboutUs.mp3",
	}
	for _, name := range uniqueNames {
		path := filepath.Join(testDir, name)
		os.WriteFile(path, []byte("unique content"), 0644)
	}

	// 3. Run Pipeline
	fmt.Println("Step 1: Scanning...")
	doScan(testDir)

	fmt.Println("Step 2: Analyzing...")
	doAnalyze(0.8)

	// DEBUG: Print groups
	var allG []SongFile
	db.Where("group_id != ''").Order("group_id").Find(&allG)
	currentG := ""
	for _, f := range allG {
		if f.GroupID != currentG {
			fmt.Printf("\nGroup %s:\n", f.GroupID)
			currentG = f.GroupID
		}
		fmt.Printf("  - %s\n", f.Filename)
	}

	// Verify groups before deletion
	var groupsCount int64
	db.Model(&SongFile{}).Where("group_id != ''").Count(&groupsCount)
	if groupsCount != 15 { // 10 from A + 5 from B
		t.Errorf("Expected 15 files in groups, got %d", groupsCount)
	}

	fmt.Println("Step 3: Auto-Deleting...")
	doAutoDelete([]string{"quality", "size_desc"})

	// 4. Verification
	fmt.Println("Verifying results...")
	
	// Check Database
	var remaining []SongFile
	db.Where("deleted = ?", false).Find(&remaining)
	
	// Expected: 1 from Group A + 1 from Group B + 20 Uniques = 22
	if len(remaining) != 22 {
		t.Errorf("Expected 22 files remaining in DB, got %d", len(remaining))
	}

	// Check Group A specifically (Quality check)
	var keptA SongFile
	db.Where("filename LIKE 'song_A%' AND deleted = ?", false).First(&keptA)
	if keptA.Ext != ".flac" {
		t.Errorf("Group A should have kept the .flac file, but kept %s", keptA.Ext)
	}

	// Check Group B specifically (Size check)
	var keptB SongFile
	db.Where("filename LIKE 'song_B%' AND deleted = ?", false).First(&keptB)
	if keptB.Size != 5000 {
		t.Errorf("Group B should have kept the largest file (5000), but kept size %d", keptB.Size)
	}

	// Check Disk
	files, _ := os.ReadDir(testDir)
	if len(files) != 22 {
		t.Errorf("Expected 22 files on disk, got %d", len(files))
	}

	fmt.Println("Integration Test Passed!")
}
