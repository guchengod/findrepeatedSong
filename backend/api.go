package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

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
	// Parse runHistory JSON string into array for frontend
	type scheduleResponse struct {
		ID         uint      `json:"id"`
		Name       string    `json:"name"`
		Cron       string    `json:"cron"`
		IsActive   bool      `json:"isActive"`
		LastRun    time.Time `json:"lastRun"`
		NextRun    time.Time `json:"nextRun"`
		RunHistory string    `json:"runHistory"`
		RunHistoryArr []RunRecord `json:"runHistoryArr"`
	}
	responses := make([]scheduleResponse, len(tasks))
	for i, t := range tasks {
		responses[i] = scheduleResponse{
			ID:         t.ID,
			Name:       t.Name,
			Cron:       t.Cron,
			IsActive:   t.IsActive,
			LastRun:    t.LastRun,
			NextRun:    t.NextRun,
			RunHistory: t.RunHistory,
		}
		if t.RunHistory != "" {
			json.Unmarshal([]byte(t.RunHistory), &responses[i].RunHistoryArr)
		}
	}
	c.JSON(http.StatusOK, responses)
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
	refreshStats()
	c.JSON(http.StatusOK, gin.H{"message": "Deleted"})
}

func apiDeleteGroup(c *gin.Context) {
	var req struct {
		GroupID string `json:"groupId"`
		KeepID  uint   `json:"keepId"`
	}
	c.ShouldBindJSON(&req)
	doManualDelete(req.GroupID, req.KeepID)
	refreshStats()
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

// --- Browse Path API ---
func apiBrowsePath(c *gin.Context) {
	dir := c.Query("dir")

	// Security: resolve the path and check it's within allowed roots
	absDir, err := filepath.Abs(dir)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid path"})
		return
	}
	// Normalize to prevent /../ bypass of prefix check
	absDir = filepath.Clean(absDir)

	// Get allowed roots from config
	var sourcePath, targetPath string
	var cfg AppConfig
	if err := db.Where("key = ?", "source_path").First(&cfg).Error; err == nil {
		sourcePath, _ = filepath.Abs(cfg.Value)
	}
	if err := db.Where("key = ?", "target_path").First(&cfg).Error; err == nil {
		targetPath, _ = filepath.Abs(cfg.Value)
	}

	// Allow root directory listing, or subdirectories of configured paths
	allowed := absDir == "/" || absDir == ""
	if !allowed && sourcePath != "" {
		if strings.HasPrefix(absDir, sourcePath) {
			allowed = true
		}
	}
	if !allowed && targetPath != "" {
		if strings.HasPrefix(absDir, targetPath) {
			allowed = true
		}
	}

	if !allowed {
		c.JSON(http.StatusForbidden, gin.H{"error": "Access denied: path not within configured source or target paths"})
		return
	}

	if absDir == "" || absDir == "/" {
		// List root volumes on darwin, or root on linux
		if runtime.GOOS == "darwin" {
			absDir = "/"
		}
	}

	entries, err := os.ReadDir(absDir)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "Cannot read directory: " + err.Error()})
		return
	}

	type FileEntry struct {
		Name     string `json:"name"`
		Path     string `json:"path"`
		IsDir    bool   `json:"isDir"`
		Size     int64  `json:"size"`
		Modified string `json:"modified"`
	}

	result := make([]FileEntry, 0, len(entries))
	for _, entry := range entries {
		info, err := entry.Info()
		if err != nil {
			continue
		}
		entryPath := filepath.Join(absDir, entry.Name())
		result = append(result, FileEntry{
			Name:     entry.Name(),
			Path:     entryPath,
			IsDir:    entry.IsDir(),
			Size:     info.Size(),
			Modified: info.ModTime().Format(time.RFC3339),
		})
	}

	// Sort: dirs first, then by name
	sort.Slice(result, func(i, j int) bool {
		if result[i].IsDir != result[j].IsDir {
			return result[i].IsDir
		}
		return result[i].Name < result[j].Name
	})

	c.JSON(http.StatusOK, gin.H{
		"entries": result,
		"parent":  filepath.Dir(absDir),
	})
}

// --- Stats API ---

const statsCacheTTL = 5 * time.Minute

var statsCache struct {
	totalSongs      int64
	totalDuplicates int64
	storageUsedGB   float64
	lastUpdated     time.Time
}
var statsMu sync.Mutex

func RefreshStats() {
	if db == nil {
		return // DB not yet initialized
	}
	var count int64
	db.Model(&SongFile{}).Where("deleted = ?", false).Count(&count)
	statsCache.totalSongs = count

	var sizeSum sql.NullInt64
	db.Model(&SongFile{}).Where("deleted = ?", false).Select("COALESCE(SUM(size), 0)").Row().Scan(&sizeSum)
	statsCache.storageUsedGB = float64(sizeSum.Int64) / 1e9

	// Count duplicates: groups with >1 member — single query using subquery
	var dupCount int64
	db.Raw(`
		SELECT COALESCE(SUM(cnt - 1), 0)
		FROM (
			SELECT group_id, COUNT(*) as cnt
			FROM song_files
			WHERE deleted = false AND group_id != ''
			GROUP BY group_id
			HAVING COUNT(*) > 1
		) AS groups_with_dups
	`).Scan(&dupCount)
	statsCache.totalDuplicates = dupCount
	statsCache.lastUpdated = time.Now()
}

// refreshStats is the internal version called after DB is ready
func refreshStats() {
	RefreshStats()
}

func apiGetStats(c *gin.Context) {
	// Invalidate cache if stale (5 min TTL), with lock to prevent thundering herd
	statsMu.Lock()
	if time.Since(statsCache.lastUpdated) > statsCacheTTL {
		refreshStats()
	}
	statsMu.Unlock()
	c.JSON(http.StatusOK, gin.H{
		"total_songs":      statsCache.totalSongs,
		"total_duplicates": statsCache.totalDuplicates,
		"storage_used_gb":  statsCache.storageUsedGB,
		"jobs_running":      GetActiveJobs(),
		"last_updated":      statsCache.lastUpdated.Format(time.RFC3339),
	})
}
