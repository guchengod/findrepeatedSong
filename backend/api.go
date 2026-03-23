package main

import (
	"net/http"
	"os"
	"strconv"

	"github.com/gin-gonic/gin"
)

// --- Settings API ---
func apiGetConfig(c *gin.Context) {
	var configs []AppConfig
	db.Find(&configs)
	c.JSON(http.StatusOK, configs)
}

func apiUpdateConfig(c *gin.Context) {
	var req AppConfig
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	db.Where("key = ?", req.Key).Assign(AppConfig{Value: req.Value}).FirstOrCreate(&AppConfig{Key: req.Key})
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// --- Schedule API ---
func apiGetSchedules(c *gin.Context) {
	var tasks []ScheduleTask
	db.Find(&tasks)
	c.JSON(http.StatusOK, tasks)
}

func apiUpdateSchedule(c *gin.Context) {
	var req ScheduleTask
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	db.Save(&req)
	updateTask(req)
	c.JSON(http.StatusOK, req)
}

// --- Enhanced Actions ---
func apiStartOrganize(c *gin.Context) {
	var req struct {
		Path string `json:"path"`
		Mode string `json:"mode"` // move, copy
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}
	go doOrganize(req.Path, req.Mode)
	c.JSON(http.StatusOK, gin.H{"message": "Organization started"})
}

func apiStartComplete(c *gin.Context) {
	var req struct {
		Path string `json:"path"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}
	if req.Path == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Path is required"})
		return
	}
	go doComplete(req.Path)
	c.JSON(http.StatusOK, gin.H{"message": "Completion started"})
}

// Existing Scan & Analyze APIs (slightly modified to support multiple paths)
func apiStartScan(c *gin.Context) {
	var req struct {
		Paths []string `json:"paths"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}
	go doScan(req.Paths)
	c.JSON(http.StatusOK, gin.H{"message": "Scan started"})
}

func apiStartAnalyze(c *gin.Context) {
	var req struct {
		Similarity float64 `json:"similarity"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		req.Similarity = 0.8
	}
	go doAnalyze(req.Similarity)
	c.JSON(http.StatusOK, gin.H{"message": "Analysis started"})
}

func apiGetGroups(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "10"))

	var allFiles []SongFile
	db.Where("group_id != '' AND deleted = ?", false).Find(&allFiles)

	groupsMap := make(map[string][]SongFile)
	var groupIDs []string
	for _, f := range allFiles {
		if _, ok := groupsMap[f.GroupID]; !ok {
			groupIDs = append(groupIDs, f.GroupID)
		}
		groupsMap[f.GroupID] = append(groupsMap[f.GroupID], f)
	}

	// Filter valid groups (>1 file)
	var validGroupIDs []string
	for _, gid := range groupIDs {
		if len(groupsMap[gid]) > 1 {
			validGroupIDs = append(validGroupIDs, gid)
		}
	}

	total := len(validGroupIDs)
	start := (page - 1) * pageSize
	if start < 0 { start = 0 }
	if start > total { start = total }
	
	end := start + pageSize
	if end > total { end = total }

	var result [][]SongFile
	if start < total {
		pagedGIDs := validGroupIDs[start:end]
		for _, gid := range pagedGIDs {
			result = append(result, groupsMap[gid])
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"groups":   result,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	})
}

func apiDeleteFile(c *gin.Context) {
	var req struct {
		ID uint `json:"id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	var f SongFile
	if err := db.First(&f, req.ID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "File not found"})
		return
	}

	os.Remove(f.Path)
	db.Model(&f).Update("deleted", true)
	c.JSON(http.StatusOK, gin.H{"message": "Deleted"})
}

func apiDeleteGroup(c *gin.Context) {
	var req struct {
		GroupID string `json:"groupId"`
		KeepID  uint   `json:"keepId"`
	}
	c.ShouldBindJSON(&req)
	doManualDelete(req.GroupID, req.KeepID)
	c.JSON(http.StatusOK, gin.H{"message": "Deleted"})
}

func apiAutoDelete(c *gin.Context) {
	var req struct {
		Strategies []string `json:"strategies"`
	}
	c.ShouldBindJSON(&req)
	go doAutoDelete(req.Strategies)
	c.JSON(http.StatusOK, gin.H{"message": "Started"})
}
