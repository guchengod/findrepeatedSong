package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/gin-gonic/gin"
)

// WorkflowRequest is intentionally explicit: a run always carries the exact
// directory and step choices it was started with, rather than silently reading
// mutable global defaults midway through execution.
type WorkflowRequest struct {
	SourcePath       string `json:"sourcePath"`
	TargetPath       string `json:"targetPath"`
	OrganizeMode     string `json:"organizeMode"`
	ScanDuplicates   bool   `json:"scanDuplicates"`
	CompleteMetadata bool   `json:"completeMetadata"`
	Organize         bool   `json:"organize"`
	DownloadLyrics   bool   `json:"downloadLyrics"`
	// SelectedPaths is used by the monitor. A regular workflow deliberately
	// uses SourcePath as a directory; a monitored workflow only processes the
	// audio files which appeared since its previous check.
	SelectedPaths []string `json:"selectedPaths,omitempty"`
}

type WorkflowMonitor struct {
	Enabled  bool            `json:"enabled"`
	RootPath string          `json:"rootPath"`
	Workflow WorkflowRequest `json:"workflow"`
}

const (
	workflowConfigKey = "workflow_default"
	monitorConfigKey  = "workflow_monitor"
)

var (
	workflowMonitorMu     sync.Mutex
	workflowMonitorCancel chan struct{}
)

func apiRunWorkflow(c *gin.Context) {
	var req WorkflowRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的工作流配置"})
		return
	}
	if err := validateWorkflowRequest(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	saveWorkflowDefault(req)

	if !startManagedJob("workflow", func() {
		runWorkflow(req)
	}, func(err error) {
		broadcastProgress("workflow", gin.H{"isRunning": false, "stage": "failed", "status": err.Error()})
	}) {
		c.JSON(http.StatusConflict, gin.H{"error": "已有工作流正在执行"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "工作流已启动"})
}

func apiGetWorkflowConfig(c *gin.Context) {
	workflow, ok := loadWorkflowDefault()
	if !ok {
		c.JSON(http.StatusOK, gin.H{})
		return
	}
	c.JSON(http.StatusOK, workflow)
}

func apiUpdateWorkflowConfig(c *gin.Context) {
	var workflow WorkflowRequest
	if err := c.ShouldBindJSON(&workflow); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的工作流配置"})
		return
	}
	if err := validateWorkflowRequest(&workflow); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	saveWorkflowDefault(workflow)
	c.JSON(http.StatusOK, workflow)
}

func validateWorkflowRequest(req *WorkflowRequest) error {
	if strings.TrimSpace(req.SourcePath) == "" {
		return fmt.Errorf("请选择工作流的来源目录")
	}
	if err := validateAccessiblePaths([]string{req.SourcePath}); err != nil {
		return err
	}
	if req.Organize && strings.TrimSpace(req.TargetPath) == "" {
		return fmt.Errorf("整理归档需要选择目标目录")
	}
	if req.OrganizeMode != "copy" {
		req.OrganizeMode = "move"
	}
	if workflowStepCount(*req) == 0 {
		return fmt.Errorf("请至少启用一个工作流步骤")
	}
	return nil
}

func runWorkflow(req WorkflowRequest) {
	broadcastProgress("workflow", gin.H{"isRunning": true, "stage": "starting", "completed": 0, "total": workflowStepCount(req), "status": "正在准备工作流"})
	completed := 0
	runStep := func(stage, status string, work func()) {
		broadcastProgress("workflow", gin.H{"isRunning": true, "stage": stage, "completed": completed, "total": workflowStepCount(req), "status": status})
		work()
		completed++
		broadcastProgress("workflow", gin.H{"isRunning": true, "stage": stage + "_done", "completed": completed, "total": workflowStepCount(req), "status": "已完成：" + status})
	}

	if req.ScanDuplicates {
		runStep("duplicates", "正在扫描重复项", func() {
			if len(req.SelectedPaths) > 0 {
				doScanSelection(req.SelectedPaths)
			} else {
				doScan([]string{req.SourcePath})
			}
			doAnalyze(0.8)
		})
	}
	if req.CompleteMetadata {
		runStep("metadata", "正在补全元数据", func() { doCompletePaths(workflowPaths(req)) })
	}
	if req.Organize {
		runStep("organize", "正在整理归档", func() { doOrganize(req.TargetPath, req.OrganizeMode, workflowPaths(req)...) })
	}
	if req.DownloadLyrics {
		runStep("lyrics", "正在下载歌词", func() { doLyricsPaths(workflowPaths(req)) })
	}
	broadcastProgress("workflow", gin.H{"isRunning": false, "stage": "done", "completed": completed, "total": workflowStepCount(req), "status": "工作流已完成"})
}

func workflowPaths(req WorkflowRequest) []string {
	if len(req.SelectedPaths) > 0 {
		return req.SelectedPaths
	}
	return []string{req.SourcePath}
}

func workflowStepCount(req WorkflowRequest) int {
	count := 0
	if req.ScanDuplicates {
		count++
	}
	if req.CompleteMetadata {
		count++
	}
	if req.Organize {
		count++
	}
	if req.DownloadLyrics {
		count++
	}
	return count
}

func saveWorkflowDefault(req WorkflowRequest) {
	req.SelectedPaths = nil
	encoded, err := json.Marshal(req)
	if err != nil {
		return
	}
	db.Where("key = ?", workflowConfigKey).Assign(AppConfig{Value: string(encoded), Desc: "Last configured music workflow"}).FirstOrCreate(&AppConfig{Key: workflowConfigKey})
}

func loadWorkflowDefault() (WorkflowRequest, bool) {
	var config AppConfig
	if err := db.Where("key = ?", workflowConfigKey).First(&config).Error; err != nil || strings.TrimSpace(config.Value) == "" {
		return WorkflowRequest{}, false
	}
	var workflow WorkflowRequest
	if json.Unmarshal([]byte(config.Value), &workflow) != nil || strings.TrimSpace(workflow.SourcePath) == "" {
		return WorkflowRequest{}, false
	}
	return workflow, true
}

func apiGetWorkflowMonitor(c *gin.Context) {
	c.JSON(http.StatusOK, loadWorkflowMonitor())
}

func apiUpdateWorkflowMonitor(c *gin.Context) {
	var monitor WorkflowMonitor
	if err := c.ShouldBindJSON(&monitor); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的监控配置"})
		return
	}
	if monitor.Enabled {
		if strings.TrimSpace(monitor.RootPath) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "请选择需要监控的根目录"})
			return
		}
		if err := validateAccessiblePaths([]string{monitor.RootPath}); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if strings.TrimSpace(monitor.Workflow.SourcePath) == "" {
			monitor.Workflow.SourcePath = monitor.RootPath
		}
		if err := validateWorkflowRequest(&monitor.Workflow); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		saveWorkflowDefault(monitor.Workflow)
	}
	if err := configureWorkflowMonitor(monitor); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "无法启动目录监控：" + err.Error()})
		return
	}
	encoded, _ := json.Marshal(monitor)
	db.Where("key = ?", monitorConfigKey).Assign(AppConfig{Value: string(encoded), Desc: "New music monitor"}).FirstOrCreate(&AppConfig{Key: monitorConfigKey})
	c.JSON(http.StatusOK, monitor)
}

func loadWorkflowMonitor() WorkflowMonitor {
	var config AppConfig
	var monitor WorkflowMonitor
	if err := db.Where("key = ?", monitorConfigKey).First(&config).Error; err == nil {
		_ = json.Unmarshal([]byte(config.Value), &monitor)
	}
	// Migrate the former polling configuration: it used the workflow source as
	// its implicit root. The new model watches that directory directly.
	if monitor.RootPath == "" {
		monitor.RootPath = monitor.Workflow.SourcePath
	}
	return monitor
}

// initWorkflowMonitor restores an event watcher for the configured directory.
// fsnotify uses inotify on Linux/FnOS, FSEvents/kqueue on macOS and ReadDirectoryChangesW
// on Windows; no timer or periodic directory scan is involved.
func initWorkflowMonitor() { _ = configureWorkflowMonitor(loadWorkflowMonitor()) }

func configureWorkflowMonitor(monitor WorkflowMonitor) error {
	var watcher *fsnotify.Watcher
	var err error
	if monitor.Enabled {
		watcher, err = fsnotify.NewWatcher()
		if err != nil {
			return err
		}
		if err = addMonitorDirectories(watcher, monitor.RootPath); err != nil {
			_ = watcher.Close()
			return err
		}
	}

	workflowMonitorMu.Lock()
	if workflowMonitorCancel != nil {
		close(workflowMonitorCancel)
		workflowMonitorCancel = nil
	}
	if !monitor.Enabled {
		workflowMonitorMu.Unlock()
		broadcastProgress("monitor", gin.H{"enabled": false, "status": "监控已暂停"})
		return nil
	}
	cancel := make(chan struct{})
	workflowMonitorCancel = cancel
	workflowMonitorMu.Unlock()

	broadcastProgress("monitor", gin.H{"enabled": true, "rootPath": monitor.RootPath, "status": "正在监听新增歌曲"})
	go watchWorkflowDirectory(watcher, cancel, monitor)
	return nil
}

func addMonitorDirectories(watcher *fsnotify.Watcher, root string) error {
	return filepath.WalkDir(root, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			return watcher.Add(path)
		}
		return nil
	})
}

func watchWorkflowDirectory(watcher *fsnotify.Watcher, cancel <-chan struct{}, monitor WorkflowMonitor) {
	defer watcher.Close()
	pending := make(map[string]struct{})
	var debounce *time.Timer
	var debounceC <-chan time.Time
	flush := func() {
		paths := make([]string, 0, len(pending))
		for path := range pending {
			if info, err := os.Stat(path); err == nil && !info.IsDir() && validExts[strings.ToLower(filepath.Ext(path))] {
				paths = append(paths, path)
			}
		}
		pending = make(map[string]struct{})
		if len(paths) > 0 {
			runWorkflowMonitorFiles(monitor, paths)
		}
	}
	scheduleFlush := func() {
		if debounce != nil && !debounce.Stop() {
			select {
			case <-debounce.C:
			default:
			}
		}
		debounce = time.NewTimer(750 * time.Millisecond)
		debounceC = debounce.C
	}

	for {
		select {
		case <-cancel:
			if debounce != nil {
				debounce.Stop()
			}
			return
		case err, ok := <-watcher.Errors:
			if !ok {
				return
			}
			broadcastProgress("monitor", gin.H{"enabled": true, "rootPath": monitor.RootPath, "status": "目录监控异常：" + err.Error()})
		case event, ok := <-watcher.Events:
			if !ok {
				return
			}
			if event.Op&fsnotify.Create != 0 {
				if info, err := os.Stat(event.Name); err == nil && info.IsDir() {
					if err := addMonitorDirectories(watcher, event.Name); err != nil {
						broadcastProgress("monitor", gin.H{"enabled": true, "rootPath": monitor.RootPath, "status": "无法监听新目录：" + err.Error()})
					}
					continue
				}
			}
			if event.Op&(fsnotify.Create|fsnotify.Write|fsnotify.Rename) != 0 && validExts[strings.ToLower(filepath.Ext(event.Name))] {
				pending[filepath.Clean(event.Name)] = struct{}{}
				scheduleFlush()
			}
		case <-debounceC:
			flush()
			debounceC = nil
		}
	}
}

func runWorkflowMonitorFiles(monitor WorkflowMonitor, paths []string) {
	broadcastProgress("monitor", gin.H{"enabled": true, "rootPath": monitor.RootPath, "newFiles": len(paths), "status": "检测到新增歌曲，正在启动工作流"})
	workflow := monitor.Workflow
	workflow.SelectedPaths = paths
	if !startManagedJob("workflow", func() { runWorkflow(workflow) }, func(err error) {
		broadcastProgress("workflow", gin.H{"isRunning": false, "stage": "failed", "status": err.Error()})
	}) {
		broadcastProgress("monitor", gin.H{"enabled": true, "rootPath": monitor.RootPath, "newFiles": len(paths), "status": "已有工作流运行，新增文件等待下一次写入事件"})
	}
}
