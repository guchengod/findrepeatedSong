package main

type SongFile struct {
	ID             uint   `json:"id" gorm:"primaryKey"`
	Path           string `json:"path" gorm:"uniqueIndex"`
	Filename       string `json:"filename"`
	NormalizedName string `json:"normalizedName" gorm:"index"`
	Size           int64  `json:"size"`
	Ext            string `json:"ext"`
	GroupID        string `json:"groupId" gorm:"index"`
	Deleted        bool   `json:"deleted" gorm:"index"`
}
