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
	appDataDir = "data"
	db.AutoMigrate(&SongFile{}, &TrashRecord{})
	os.RemoveAll(filepath.Join(appDataDir, "trash"))
	defer os.RemoveAll(filepath.Join(appDataDir, "trash"))

	// 2. Generate dummy data in dummy_music
	testDir := "../dummy_music_test"
	os.RemoveAll(testDir)
	os.MkdirAll(testDir, 0755)
	defer os.RemoveAll(testDir)

	// Group 1: 10 duplicates, mix of mp3 and flac
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
	for i := 1; i <= 5; i++ {
		size := int64(1000 * i)
		path := filepath.Join(testDir, fmt.Sprintf("song_B_%d.mp3", i))
		os.WriteFile(path, make([]byte, size), 0644)
	}

	// Group 3: Unique files
	uniqueNames := []string{"Yesterday.mp3", "Imagine.mp3", "BillieJean.mp3"}
	for _, name := range uniqueNames {
		path := filepath.Join(testDir, name)
		os.WriteFile(path, []byte("unique content"), 0644)
	}

	// 3. Run Pipeline
	fmt.Println("Step 1: Scanning...")
	doScan([]string{testDir})

	fmt.Println("Step 2: Analyzing...")
	doAnalyze(0.8)

	fmt.Println("Step 3: Auto-Deleting...")
	doAutoDelete([]string{"quality", "size_desc"})

	// 4. Verification
	var remaining []SongFile
	db.Where("deleted = ?", false).Find(&remaining)

	if len(remaining) != 5 { // 1 from A + 1 from B + 3 Uniques
		t.Errorf("Expected 5 files remaining in DB, got %d", len(remaining))
	}

	fmt.Println("Integration Test Passed!")
}

func TestOrganize(t *testing.T) {
	// Setup
	dbFile := "data/test_org.db"
	os.Remove(dbFile)
	os.MkdirAll("data", 0755)

	var err error
	db, err = gorm.Open(sqlite.Open(dbFile), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	appDataDir = "data"
	db.AutoMigrate(&SongFile{}, &TrashRecord{})

	sourceDir := "../dummy_org_source"
	targetDir := "../dummy_org_target"
	os.RemoveAll(sourceDir)
	os.RemoveAll(targetDir)
	os.MkdirAll(sourceDir, 0755)
	os.MkdirAll(targetDir, 0755)
	defer os.RemoveAll(sourceDir)
	defer os.RemoveAll(targetDir)

	// Create a song and a lyrics file
	songName := "TestSong.mp3"
	lrcName := "TestSong.lrc"
	os.WriteFile(filepath.Join(sourceDir, songName), []byte("audio content"), 0644)
	os.WriteFile(filepath.Join(sourceDir, lrcName), []byte("lyrics content"), 0644)

	// Scan
	doScan([]string{sourceDir})

	// Manually set artist and album in DB to simulate tags
	db.Model(&SongFile{}).Where("filename = ?", songName).Updates(map[string]interface{}{
		"artist": "TestArtist",
		"album":  "TestAlbum",
	})

	// Run Organize
	doOrganize(targetDir, "move")

	// Verify
	expectedSongPath := filepath.Join(targetDir, "TestArtist", "TestAlbum", songName)
	if _, err := os.Stat(expectedSongPath); os.IsNotExist(err) {
		t.Errorf("Song was not moved to expected path: %s", expectedSongPath)
	}

	fmt.Println("Organize Test Passed!")
}
