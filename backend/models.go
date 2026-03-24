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

type AppConfig struct {
	ID    uint   `json:"id" gorm:"primaryKey"`
	Key   string `json:"key" gorm:"uniqueIndex"`
	Value string `json:"value"`
	Desc  string `json:"desc"`
}

// RunRecord represents a single execution of a scheduled task.
type RunRecord struct {
	ID        string    `json:"id"`         // e.g. "ORG-20260324-143201"
	Timestamp time.Time `json:"timestamp"`  // when it ran
	Status    string    `json:"status"`     // "COMPLETE" or "FAILED"
	Duration  int64     `json:"duration_ms"` // how long it took
	Error     *string   `json:"error"`      // error message if FAILED, nil if COMPLETE
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
