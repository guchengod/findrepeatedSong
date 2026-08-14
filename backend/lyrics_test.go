package main

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestWriteLyricsSidecarWritesAndPreservesExistingFile(t *testing.T) {
	directory := t.TempDir()
	trackPath := filepath.Join(directory, "测试歌曲.mp3")
	if err := os.WriteFile(trackPath, []byte("audio"), 0644); err != nil {
		t.Fatal(err)
	}
	lyricsPath, err := writeLyricsSidecar(trackPath, "[00:01.00]歌词\n")
	if err != nil {
		t.Fatal(err)
	}
	content, err := os.ReadFile(lyricsPath)
	if err != nil || string(content) != "[00:01.00]歌词\n" {
		t.Fatalf("unexpected lyric content: %q, %v", content, err)
	}
	_, err = writeLyricsSidecar(trackPath, "new content")
	if !errors.Is(err, os.ErrExist) {
		t.Fatalf("expected existing sidecar to be protected, got %v", err)
	}
}
