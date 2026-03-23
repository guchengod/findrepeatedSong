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

	go func() {
		broadcastProgress("pipeline", gin.H{"isRunning": true, "stage": "scan"})
		doScan(req.Paths)

		broadcastProgress("pipeline", gin.H{"isRunning": true, "stage": "analyze"})
		doAnalyze(req.Similarity)

		broadcastProgress("pipeline", gin.H{"isRunning": false, "stage": "done"})
	}()

	c.JSON(http.StatusOK, gin.H{"message": "Search started"})
}
