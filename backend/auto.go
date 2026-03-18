package main

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

var pipelineStatus struct {
	sync.RWMutex
	IsRunning bool
	Stage     string // "scan", "analyze", "delete", "done"
	StartedAt time.Time
}

func apiFullPipeline(c *gin.Context) {
	var req struct {
		Path       string   `json:"path"`
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

	pipelineStatus.Lock()
	if pipelineStatus.IsRunning {
		pipelineStatus.Unlock()
		c.JSON(http.StatusConflict, gin.H{"error": "Pipeline already running"})
		return
	}
	pipelineStatus.IsRunning = true
	pipelineStatus.Stage = "scan"
	pipelineStatus.StartedAt = time.Now()
	pipelineStatus.Unlock()

	go func() {
		defer func() {
			pipelineStatus.Lock()
			pipelineStatus.IsRunning = false
			pipelineStatus.Stage = "done"
			pipelineStatus.Unlock()
		}()

		// 1. Scan
		doScan(req.Path)
		for {
			scanProgress.RLock()
			running := scanProgress.IsRunning
			scanProgress.RUnlock()
			if !running {
				break
			}
			time.Sleep(500 * time.Millisecond)
		}

		// 2. Analyze
		pipelineStatus.Lock()
		pipelineStatus.Stage = "analyze"
		pipelineStatus.Unlock()
		
		doAnalyze(req.Similarity)
		for {
			analyzeProgress.RLock()
			running := analyzeProgress.IsRunning
			analyzeProgress.RUnlock()
			if !running {
				break
			}
			time.Sleep(500 * time.Millisecond)
		}

		// 3. Delete
		pipelineStatus.Lock()
		pipelineStatus.Stage = "delete"
		pipelineStatus.Unlock()
		
		doAutoDelete(req.Strategies)
		for {
			autoProgress.RLock()
			running := autoProgress.IsRunning
			autoProgress.RUnlock()
			if !running {
				break
			}
			time.Sleep(500 * time.Millisecond)
		}
	}()

	c.JSON(http.StatusOK, gin.H{"message": "Full pipeline started"})
}

func apiPipelineProgress(c *gin.Context) {
	pipelineStatus.RLock()
	defer pipelineStatus.RUnlock()
	
	c.JSON(http.StatusOK, gin.H{
		"isRunning": pipelineStatus.IsRunning,
		"stage":     pipelineStatus.Stage,
		"elapsed":   time.Since(pipelineStatus.StartedAt).Seconds(),
	})
}
