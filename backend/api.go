package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func apiStartScan(c *gin.Context) {
	var req struct {
		Path string `json:"path"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	scanProgress.RLock()
	if scanProgress.IsRunning {
		scanProgress.RUnlock()
		c.JSON(http.StatusConflict, gin.H{"error": "Scan already running"})
		return
	}
	scanProgress.RUnlock()

	go doScan(req.Path)
	c.JSON(http.StatusOK, gin.H{"message": "Scan started"})
}

func apiScanProgress(c *gin.Context) {
	scanProgress.RLock()
	defer scanProgress.RUnlock()
	c.JSON(http.StatusOK, gin.H{
		"isRunning": scanProgress.IsRunning,
		"scanned":   scanProgress.Scanned,
		"message":   scanProgress.TotalMsg,
	})
}

func apiStartAnalyze(c *gin.Context) {
	var req struct {
		Similarity float64 `json:"similarity"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}
	if req.Similarity <= 0 {
		req.Similarity = 0.8
	}

	analyzeProgress.RLock()
	if analyzeProgress.IsRunning {
		analyzeProgress.RUnlock()
		c.JSON(http.StatusConflict, gin.H{"error": "Analysis already running"})
		return
	}
	analyzeProgress.RUnlock()

	go doAnalyze(req.Similarity)
	c.JSON(http.StatusOK, gin.H{"message": "Analysis started"})
}

func apiAnalyzeProgress(c *gin.Context) {
	analyzeProgress.RLock()
	defer analyzeProgress.RUnlock()
	c.JSON(http.StatusOK, gin.H{
		"isRunning": analyzeProgress.IsRunning,
		"percent":   analyzeProgress.Percent,
		"message":   analyzeProgress.TotalMsg,
	})
}

func apiGetGroups(c *gin.Context) {
	var allFiles []SongFile
	db.Where("group_id != '' AND deleted = ?", false).Find(&allFiles)

	groupsMap := make(map[string][]SongFile)
	for _, f := range allFiles {
		groupsMap[f.GroupID] = append(groupsMap[f.GroupID], f)
	}

	// Only return groups that actually have more than 1 file (just in case some got deleted)
	var result [][]SongFile
	for _, files := range groupsMap {
		if len(files) > 1 {
			result = append(result, files)
		}
	}

	c.JSON(http.StatusOK, gin.H{"groups": result})
}

func apiDeleteGroup(c *gin.Context) {
	var req struct {
		GroupID string `json:"groupId"`
		KeepID  uint   `json:"keepId"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	doManualDelete(req.GroupID, req.KeepID)
	c.JSON(http.StatusOK, gin.H{"message": "Deleted"})
}

func apiAutoDelete(c *gin.Context) {
	var req struct {
		Strategies []string `json:"strategies"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		req.Strategies = []string{"quality", "size_desc"}
	}

	autoProgress.RLock()
	if autoProgress.IsRunning {
		autoProgress.RUnlock()
		c.JSON(http.StatusConflict, gin.H{"error": "Auto process already running"})
		return
	}
	autoProgress.RUnlock()

	go doAutoDelete(req.Strategies)
	c.JSON(http.StatusOK, gin.H{"message": "Auto delete started"})
}

func apiAutoDeleteProgress(c *gin.Context) {
	autoProgress.RLock()
	defer autoProgress.RUnlock()
	c.JSON(http.StatusOK, gin.H{
		"isRunning": autoProgress.IsRunning,
		"percent":   autoProgress.Percent,
		"message":   autoProgress.TotalMsg,
	})
}
