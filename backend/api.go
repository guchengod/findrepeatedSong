package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
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
		ID            uint        `json:"id"`
		Name          string      `json:"name"`
		Cron          string      `json:"cron"`
		IsActive      bool        `json:"isActive"`
		LastRun       time.Time   `json:"lastRun"`
		NextRun       time.Time   `json:"nextRun"`
		RunHistory    string      `json:"runHistory"`
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

func apiStartLyrics(c *gin.Context) {
	var req struct {
		Path string `json:"path"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Path) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Path is required"})
		return
	}
	path, err := filepath.Abs(req.Path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid path"})
		return
	}
	allowed := false
	for _, root := range configuredBrowseRoots() {
		if pathWithinRoot(path, root.Path) {
			allowed = true
			break
		}
	}
	if !allowed {
		c.JSON(http.StatusForbidden, gin.H{"error": "Path is not within an accessible music directory"})
		return
	}
	if info, err := os.Stat(path); err != nil || !info.IsDir() {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Path must be a readable directory"})
		return
	}
	if !startLyricsJob(path) {
		c.JSON(http.StatusConflict, gin.H{"error": "A lyrics completion job is already running"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Lyrics completion started"})
}

func apiGetLyrics(c *gin.Context) {
	var records []LyricsRecord
	db.Order("completed_at desc").Limit(100).Find(&records)
	c.JSON(http.StatusOK, records)
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
	if start < 0 {
		start = 0
	}
	if start > total {
		start = total
	}

	end := start + pageSize
	if end > total {
		end = total
	}

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

	if err := db.Transaction(func(tx *gorm.DB) error {
		return moveToTrash(tx, f)
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Unable to move file to recycle bin"})
		return
	}
	refreshStats()
	c.JSON(http.StatusOK, gin.H{"message": "Moved to recycle bin"})
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

// --- Recycle bin API ---
func apiGetTrash(c *gin.Context) {
	var records []TrashRecord
	db.Order("created_at desc").Find(&records)
	c.JSON(http.StatusOK, records)
}

func apiRestoreTrash(c *gin.Context) {
	var req struct {
		ID uint `json:"id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.ID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid recycle bin record"})
		return
	}

	var record TrashRecord
	if err := db.First(&record, req.ID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Recycle bin record not found"})
		return
	}
	if _, err := os.Stat(record.OriginalPath); err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "Original path already exists"})
		return
	}
	if err := os.MkdirAll(filepath.Dir(record.OriginalPath), 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Unable to create original directory"})
		return
	}
	if err := os.Rename(record.TrashPath, record.OriginalPath); err != nil {
		if err := copyThenRemove(record.TrashPath, record.OriginalPath); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Unable to restore file"})
			return
		}
	}
	db.Transaction(func(tx *gorm.DB) error {
		tx.Model(&SongFile{}).Where("id = ?", record.SongFileID).Update("deleted", false)
		return tx.Delete(&record).Error
	})
	refreshStats()
	c.JSON(http.StatusOK, gin.H{"message": "Restored"})
}

func apiEmptyTrash(c *gin.Context) {
	var records []TrashRecord
	db.Find(&records)
	for _, record := range records {
		if err := os.Remove(record.TrashPath); err != nil && !os.IsNotExist(err) {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Unable to permanently remove recycle bin contents"})
			return
		}
	}
	db.Where("1 = 1").Delete(&TrashRecord{})
	c.JSON(http.StatusOK, gin.H{"message": "Recycle bin emptied"})
}

// --- Browse Path API ---
type browseRoot struct {
	Label string `json:"label"`
	Path  string `json:"path"`
}

func pathWithinRoot(path, root string) bool {
	relative, err := filepath.Rel(root, path)
	return err == nil && relative != ".." && !strings.HasPrefix(relative, ".."+string(os.PathSeparator))
}

func configuredBrowseRoots() []browseRoot {
	roots := make([]browseRoot, 0, 3)
	appendRoot := func(label, path string) {
		if strings.TrimSpace(path) == "" {
			return
		}
		absolute, err := filepath.Abs(path)
		if err != nil {
			return
		}
		if info, err := os.Stat(absolute); err != nil || !info.IsDir() {
			return
		}
		for _, root := range roots {
			if root.Path == absolute {
				return
			}
		}
		roots = append(roots, browseRoot{Label: label, Path: absolute})
	}

	// fnOS packages mount the folder chosen in the install wizard at /music. Keep
	// browsing within mounted folders there, rather than exposing container paths.
	if info, err := os.Stat("/music"); err == nil && info.IsDir() {
		appendRoot("飞牛音乐目录", "/music")
	} else {
		appendRoot("本机文件系统", string(os.PathSeparator))
	}

	for _, item := range []struct{ key, label string }{
		{"source_path", "当前音乐库"},
		{"target_path", "整理目标目录"},
	} {
		var config AppConfig
		if err := db.Where("key = ?", item.key).First(&config).Error; err == nil {
			appendRoot(item.label, config.Value)
		}
	}
	return roots
}

func apiBrowsePath(c *gin.Context) {
	roots := configuredBrowseRoots()
	if len(roots) == 0 {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "没有可浏览的目录，请先挂载音乐目录。"})
		return
	}

	dir := strings.TrimSpace(c.Query("dir"))
	if dir == "" {
		dir = roots[0].Path
	}
	absDir, err := filepath.Abs(dir)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的目录路径"})
		return
	}
	absDir = filepath.Clean(absDir)

	allowed := false
	for _, root := range roots {
		if pathWithinRoot(absDir, root.Path) {
			allowed = true
			break
		}
	}
	if !allowed {
		c.JSON(http.StatusForbidden, gin.H{"error": "该目录不在已挂载或已配置的音乐目录中"})
		return
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

	parent := filepath.Dir(absDir)
	parentAllowed := false
	for _, root := range roots {
		if pathWithinRoot(parent, root.Path) && parent != absDir {
			parentAllowed = true
			break
		}
	}
	if !parentAllowed {
		parent = ""
	}
	c.JSON(http.StatusOK, gin.H{
		"entries": result,
		"parent":  parent,
		"path":    absDir,
		"roots":   roots,
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
		"jobs_running":     GetActiveJobs(),
		"last_updated":     statsCache.lastUpdated.Format(time.RFC3339),
	})
}
