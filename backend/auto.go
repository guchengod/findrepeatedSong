package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func apiFullPipeline(c *gin.Context) {
	var req struct {
		Paths      []string `json:"paths"`
		Similarity float64  `json:"similarity"`
		Strategies []string `json:"strategies"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}
	if len(req.Strategies) == 0 {
		req.Strategies = []string{"quality", "size_desc"}
	}
	if req.Similarity <= 0 {
		req.Similarity = 0.8
	}

	if !startManagedJob("pipeline", func() {
		defer func() {
			broadcastProgress("pipeline", gin.H{"isRunning": false, "stage": "done"})
		}()
		broadcastProgress("pipeline", gin.H{"isRunning": true, "stage": "scan"})
		doScan(req.Paths)

		broadcastProgress("pipeline", gin.H{"isRunning": true, "stage": "analyze"})
		doAnalyze(req.Similarity)
	}, func(err error) {
		broadcastProgress("pipeline", gin.H{"isRunning": false, "stage": "failed", "status": err.Error()})
	}) {
		c.JSON(http.StatusConflict, gin.H{"error": "A scan pipeline is already running"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Search started"})
}

// apiManualScan scans only explicitly selected files or folders. It leaves the
// rest of the indexed library intact so manual review cannot hide prior files.
func apiManualScan(c *gin.Context) {
	var req struct {
		Paths      []string `json:"paths"`
		Similarity float64  `json:"similarity"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || len(req.Paths) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请选择至少一个音乐文件或文件夹"})
		return
	}
	if err := validateAccessiblePaths(req.Paths); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}
	if req.Similarity <= 0 {
		req.Similarity = 0.8
	}
	if !startManagedJob("pipeline", func() {
		defer broadcastProgress("pipeline", gin.H{"isRunning": false, "stage": "done"})
		broadcastProgress("pipeline", gin.H{"isRunning": true, "stage": "scan"})
		doScanSelection(req.Paths)
		broadcastProgress("pipeline", gin.H{"isRunning": true, "stage": "analyze"})
		doAnalyze(req.Similarity)
	}, func(err error) {
		broadcastProgress("pipeline", gin.H{"isRunning": false, "stage": "failed", "status": err.Error()})
	}) {
		c.JSON(http.StatusConflict, gin.H{"error": "A scan pipeline is already running"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Selected scan started"})
}
