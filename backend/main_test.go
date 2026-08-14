package main

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func TestEnvOrDefault(t *testing.T) {
	t.Setenv("FINDREPEATEDSONG_TEST_VALUE", "configured")
	if got := envOrDefault("FINDREPEATEDSONG_TEST_VALUE", "fallback"); got != "configured" {
		t.Fatalf("envOrDefault() = %q, want configured value", got)
	}

	t.Setenv("FINDREPEATEDSONG_TEST_VALUE", "")
	if got := envOrDefault("FINDREPEATEDSONG_TEST_VALUE", "fallback"); got != "fallback" {
		t.Fatalf("envOrDefault() = %q, want fallback", got)
	}
}

func TestMoveToTrashKeepsRecoverableRecord(t *testing.T) {
	workdir := t.TempDir()
	previousDataDir := appDataDir
	defer func() { appDataDir = previousDataDir }()
	appDataDir = filepath.Join(workdir, "app-data")

	var err error
	db, err = gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&SongFile{}, &TrashRecord{}); err != nil {
		t.Fatal(err)
	}

	sourcePath := filepath.Join(workdir, "duplicate.mp3")
	if err := os.WriteFile(sourcePath, []byte("music"), 0644); err != nil {
		t.Fatal(err)
	}
	file := SongFile{Path: sourcePath, Filename: "duplicate.mp3", Size: 5}
	if err := db.Create(&file).Error; err != nil {
		t.Fatal(err)
	}

	if err := db.Transaction(func(tx *gorm.DB) error { return moveToTrash(tx, file) }); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(sourcePath); !os.IsNotExist(err) {
		t.Fatalf("source file still exists after moving to trash: %v", err)
	}

	var record TrashRecord
	if err := db.First(&record).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(record.TrashPath); err != nil {
		t.Fatalf("trash file was not created: %v", err)
	}
	var saved SongFile
	if err := db.First(&saved, file.ID).Error; err != nil {
		t.Fatal(err)
	}
	if !saved.Deleted {
		t.Fatal("song was not marked deleted after being moved to trash")
	}
}
