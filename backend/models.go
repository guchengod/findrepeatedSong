package main

import "time"

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
	ID         uint   `json:"id" gorm:"primaryKey"`
	Key        string `json:"key" gorm:"uniqueIndex"`
	Value      string `json:"value"`
	Desc       string `json:"desc"`
}

type ScheduleTask struct {
	ID         uint      `json:"id" gorm:"primaryKey"`
	Name       string    `json:"name"` // "organize", "complete"
	Cron       string    `json:"cron"` // e.g., "0 0 * * *"
	IsActive   bool      `json:"isActive"`
	LastRun    time.Time `json:"lastRun"`
	NextRun    time.Time `json:"nextRun"`
}
