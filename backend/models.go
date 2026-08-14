package main

import (
	"encoding/json"
	"time"
)

type SongFile struct {
	ID             uint      `json:"id" gorm:"primaryKey"`
	Path           string    `json:"path" gorm:"uniqueIndex"`
	Filename       string    `json:"filename"`
	Artist         string    `json:"artist" gorm:"index"`
	Album          string    `json:"album" gorm:"index"`
	Title          string    `json:"title" gorm:"index"`
	NormalizedName string    `json:"normalizedName" gorm:"index"`
	Duration       float64   `json:"duration"`
	Size           int64     `json:"size"`
	Ext            string    `json:"ext"`
	GroupID        string    `json:"groupId" gorm:"index"`
	Deleted        bool      `json:"deleted" gorm:"index"`
	UpdatedAt      time.Time `json:"updatedAt"`
}

// TrashRecord keeps enough information to restore a file that was removed from
// a duplicate group. Files are moved into the app data directory rather than
// being permanently deleted, so a destructive action has a recovery path.
type TrashRecord struct {
	ID           uint      `json:"id" gorm:"primaryKey"`
	SongFileID   uint      `json:"songFileId" gorm:"index"`
	OriginalPath string    `json:"originalPath"`
	TrashPath    string    `json:"trashPath"`
	Filename     string    `json:"filename"`
	Size         int64     `json:"size"`
	CreatedAt    time.Time `json:"createdAt"`
}

type AppConfig struct {
	ID    uint   `json:"id" gorm:"primaryKey"`
	Key   string `json:"key" gorm:"uniqueIndex"`
	Value string `json:"value"`
	Desc  string `json:"desc"`
}

// LyricsRecord records a sidecar lyric file generated for a local track. The
// lyric text itself remains in the user's music directory instead of the app DB.
type LyricsRecord struct {
	ID          uint      `json:"id" gorm:"primaryKey"`
	TrackPath   string    `json:"trackPath" gorm:"uniqueIndex"`
	LyricsPath  string    `json:"lyricsPath"`
	Provider    string    `json:"provider"`
	Synced      bool      `json:"synced"`
	Status      string    `json:"status"`
	Message     string    `json:"message"`
	CompletedAt time.Time `json:"completedAt"`
}

// RunRecord represents a single execution of a scheduled task.
type RunRecord struct {
	ID        string    `json:"id"`          // e.g. "ORG-20260324-143201"
	Timestamp time.Time `json:"timestamp"`   // when it ran
	Status    string    `json:"status"`      // "COMPLETE" or "FAILED"
	Duration  int64     `json:"duration_ms"` // how long it took
	Error     *string   `json:"error"`       // error message if FAILED, nil if COMPLETE
}

type ScheduleTask struct {
	ID         uint      `json:"id" gorm:"primaryKey"`
	Name       string    `json:"name"` // "organize", "complete"
	Cron       string    `json:"cron"` // e.g., "0 0 * * *"
	IsActive   bool      `json:"isActive"`
	LastRun    time.Time `json:"lastRun"`
	NextRun    time.Time `json:"nextRun"`
	RunHistory string    `json:"runHistory"` // JSON array of RunRecord, max 10 entries
}

// AutomationTask owns both its trigger and its workflow definition. This lets
// a library have any number of independent schedules and directory watchers
// without them accidentally sharing mutable global workflow settings.
type AutomationTask struct {
	ID           uint      `json:"id" gorm:"primaryKey"`
	Name         string    `json:"name"`
	Kind         string    `json:"kind" gorm:"index"` // schedule | monitor
	Cron         string    `json:"cron"`
	RootPath     string    `json:"rootPath"`
	IsActive     bool      `json:"isActive" gorm:"index"`
	WorkflowJSON string    `json:"-"`
	LastRun      time.Time `json:"lastRun"`
	RunHistory   string    `json:"-"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

// AddRunRecord appends a new RunRecord to history, trimming to max 10 entries.
func (t *ScheduleTask) AddRunRecord(rec RunRecord) {
	var history []RunRecord
	if t.RunHistory != "" {
		json.Unmarshal([]byte(t.RunHistory), &history)
	}
	history = append(history, rec)
	if len(history) > 10 {
		history = history[len(history)-10:]
	}
	data, _ := json.Marshal(history)
	t.RunHistory = string(data)
}

// GetRunHistory returns the parsed run history.
func (t *ScheduleTask) GetRunHistory() []RunRecord {
	var history []RunRecord
	if t.RunHistory == "" {
		return history
	}
	json.Unmarshal([]byte(t.RunHistory), &history)
	return history
}

// GenerateRunID generates a mission-style ID like "ORG-20260324-143201".
func GenerateRunID(taskName string) string {
	prefix := "ORG"
	if taskName == "complete" {
		prefix = "META"
	}
	return prefix + "-" + time.Now().Format("20060102-150405")
}
