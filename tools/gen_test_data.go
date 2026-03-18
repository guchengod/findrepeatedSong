package main

import (
	"fmt"
	"os"
	"path/filepath"
)

func main() {
	targetDir := "dummy_music"
	os.MkdirAll(targetDir, 0755)

	fmt.Println("Generating test data in", targetDir, "...")

	// 1. Group A: Exact duplicates by name (different extensions/qualities)
	// Strategy: "Quality First" should keep the .flac or .wav
	groupA := []struct {
		name string
		ext  string
		size int64
	}{
		{"周杰伦 - 七里香", ".mp3", 5000000},
		{"周杰伦 - 七里香", ".wav", 50000000},
		{"周杰伦 - 七里香", ".flac", 35000000},
		{"周杰伦 - 七里香(1)", ".mp3", 4800000},
	}
	for _, f := range groupA {
		path := filepath.Join(targetDir, f.name+f.ext)
		os.WriteFile(path, make([]byte, f.size), 0644)
	}

	// 2. Group B: Fuzzy duplicates (similar names, same content size)
	// Strategy: "Largest Size" should keep any, but they are all same
	groupB := []string{
		"Eason Chan - Ten Years.mp3",
		"Eason Chan - Ten Years (Official).mp3",
		"10. Ten Years - Eason.mp3",
		"Ten Years (Live) - Eason Chan.mp3",
	}
	for _, name := range groupB {
		path := filepath.Join(targetDir, name)
		os.WriteFile(path, make([]byte, 6000000), 0644)
	}

	// 3. Group C: High volume duplicates (10 files)
	for i := 1; i <= 10; i++ {
		path := filepath.Join(targetDir, fmt.Sprintf("Repeated_Track_01 (%d).mp3", i))
		os.WriteFile(path, make([]byte, 3000000+int64(i*100)), 0644)
	}

	// 4. Unique Files (Should NOT be grouped)
	uniques := []string{
		"Linkin Park - Numb.mp3",
		"Queen - Bohemian Rhapsody.flac",
		"Michael Jackson - Billie Jean.wav",
		"Taylor Swift - Love Story.m4a",
		"Coldplay - Yellow.ogg",
	}
	for _, name := range uniques {
		path := filepath.Join(targetDir, name)
		os.WriteFile(path, make([]byte, 8000000), 0644)
	}

	// 5. Nested Duplicates
	subDir := filepath.Join(targetDir, "Favorites")
	os.MkdirAll(subDir, 0755)
	os.WriteFile(filepath.Join(subDir, "周杰伦 - 七里香 (Backup).mp3"), make([]byte, 5000000), 0644)

	fmt.Println("Done! Generated ~30 test files.")
}
