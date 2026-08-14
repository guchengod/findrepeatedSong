package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/gin-gonic/gin"
	"github.com/robfig/cron/v3"
)

type automationRequest struct {
	ID       uint            `json:"id"`
	Name     string          `json:"name"`
	Kind     string          `json:"kind"`
	Cron     string          `json:"cron"`
	RootPath string          `json:"rootPath"`
	IsActive bool            `json:"isActive"`
	Workflow WorkflowRequest `json:"workflow"`
}

type automationResponse struct {
	ID        uint            `json:"id"`
	Name      string          `json:"name"`
	Kind      string          `json:"kind"`
	Cron      string          `json:"cron"`
	RootPath  string          `json:"rootPath"`
	IsActive  bool            `json:"isActive"`
	Workflow  WorkflowRequest `json:"workflow"`
	LastRun   time.Time       `json:"lastRun"`
	CreatedAt time.Time       `json:"createdAt"`
}

var automationRuntime = struct {
	sync.Mutex
	cronEntries map[uint]cron.EntryID
	cancels     map[uint]chan struct{}
}{cronEntries: make(map[uint]cron.EntryID), cancels: make(map[uint]chan struct{})}

func apiGetAutomationTasks(c *gin.Context) {
	var tasks []AutomationTask
	db.Order("created_at desc").Find(&tasks)
	responses := make([]automationResponse, 0, len(tasks))
	for _, task := range tasks {
		response, ok := automationTaskResponse(task)
		if ok {
			responses = append(responses, response)
		}
	}
	c.JSON(http.StatusOK, responses)
}

func apiSaveAutomationTask(c *gin.Context) {
	var request automationRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的自动化配置"})
		return
	}
	request.Name = strings.TrimSpace(request.Name)
	if request.Name == "" {
		request.Name = "未命名工作流"
	}
	if request.Kind != "schedule" && request.Kind != "monitor" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "自动化类型必须是定时或监控"})
		return
	}
	if request.Kind == "monitor" {
		if strings.TrimSpace(request.RootPath) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "请选择监控根目录"})
			return
		}
		if err := validateAccessiblePaths([]string{request.RootPath}); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if request.Workflow.SourcePath == "" {
			request.Workflow.SourcePath = request.RootPath
		}
	} else if _, err := cron.ParseStandard(request.Cron); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "定时表达式无效"})
		return
	}
	if err := validateWorkflowRequest(&request.Workflow); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	workflowJSON, _ := json.Marshal(request.Workflow)
	task := AutomationTask{
		Name: request.Name, Kind: request.Kind, Cron: request.Cron, RootPath: request.RootPath,
		IsActive: request.IsActive, WorkflowJSON: string(workflowJSON),
	}
	if request.ID != 0 {
		var existing AutomationTask
		if err := db.First(&existing, request.ID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "自动化任务不存在"})
			return
		}
		task.ID, task.CreatedAt, task.LastRun, task.RunHistory = existing.ID, existing.CreatedAt, existing.LastRun, existing.RunHistory
	}
	if err := db.Save(&task).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "无法保存自动化任务"})
		return
	}
	if err := registerAutomationTask(task); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "已保存，但无法启动自动化：" + err.Error()})
		return
	}
	response, _ := automationTaskResponse(task)
	c.JSON(http.StatusOK, response)
}

func apiDeleteAutomationTask(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的自动化任务"})
		return
	}
	removeAutomationTask(uint(id))
	if err := db.Delete(&AutomationTask{}, uint(id)).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "无法删除自动化任务"})
		return
	}
	c.Status(http.StatusNoContent)
}

func automationTaskResponse(task AutomationTask) (automationResponse, bool) {
	var workflow WorkflowRequest
	if json.Unmarshal([]byte(task.WorkflowJSON), &workflow) != nil {
		return automationResponse{}, false
	}
	return automationResponse{ID: task.ID, Name: task.Name, Kind: task.Kind, Cron: task.Cron, RootPath: task.RootPath, IsActive: task.IsActive, Workflow: workflow, LastRun: task.LastRun, CreatedAt: task.CreatedAt}, true
}

func initAutomationTasks() {
	var tasks []AutomationTask
	db.Where("is_active = ?", true).Find(&tasks)
	for _, task := range tasks {
		if err := registerAutomationTask(task); err != nil {
			broadcastProgress("automation", gin.H{"id": task.ID, "status": "自动化恢复失败：" + err.Error()})
		}
	}
}

func removeAutomationTask(id uint) {
	automationRuntime.Lock()
	if entry, ok := automationRuntime.cronEntries[id]; ok && cronRunner != nil {
		cronRunner.Remove(entry)
		delete(automationRuntime.cronEntries, id)
	}
	if cancel, ok := automationRuntime.cancels[id]; ok {
		close(cancel)
		delete(automationRuntime.cancels, id)
	}
	automationRuntime.Unlock()
}

func registerAutomationTask(task AutomationTask) error {
	removeAutomationTask(task.ID)
	if !task.IsActive {
		return nil
	}
	response, ok := automationTaskResponse(task)
	if !ok {
		return fmt.Errorf("工作流配置损坏")
	}
	if response.Kind == "schedule" {
		if cronRunner == nil {
			return fmt.Errorf("定时器尚未启动")
		}
		entry, err := cronRunner.AddFunc(response.Cron, func() { runAutomationTask(task, nil) })
		if err != nil {
			return err
		}
		automationRuntime.Lock()
		automationRuntime.cronEntries[task.ID] = entry
		automationRuntime.Unlock()
		return nil
	}
	return startAutomationMonitor(task, response.Workflow)
}

func startAutomationMonitor(task AutomationTask, workflow WorkflowRequest) error {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}
	if err := addMonitorDirectories(watcher, task.RootPath); err != nil {
		_ = watcher.Close()
		return err
	}
	cancel := make(chan struct{})
	automationRuntime.Lock()
	automationRuntime.cancels[task.ID] = cancel
	automationRuntime.Unlock()
	broadcastProgress("automation", gin.H{"id": task.ID, "kind": "monitor", "status": "正在监听 " + task.RootPath})
	go watchAutomationDirectory(task, workflow, watcher, cancel)
	return nil
}

func watchAutomationDirectory(task AutomationTask, workflow WorkflowRequest, watcher *fsnotify.Watcher, cancel <-chan struct{}) {
	defer watcher.Close()
	pending := map[string]struct{}{}
	var timer *time.Timer
	var timerC <-chan time.Time
	scheduleFlush := func() {
		if timer != nil && !timer.Stop() {
			select {
			case <-timer.C:
			default:
			}
		}
		timer = time.NewTimer(750 * time.Millisecond)
		timerC = timer.C
	}
	flush := func() {
		paths := make([]string, 0, len(pending))
		for path := range pending {
			if info, err := os.Stat(path); err == nil && !info.IsDir() && validExts[strings.ToLower(filepath.Ext(path))] {
				paths = append(paths, path)
			}
		}
		pending = map[string]struct{}{}
		if len(paths) > 0 {
			runAutomationTask(task, paths)
		}
	}
	for {
		select {
		case <-cancel:
			if timer != nil {
				timer.Stop()
			}
			return
		case event, ok := <-watcher.Events:
			if !ok {
				return
			}
			if event.Op&fsnotify.Create != 0 {
				if info, err := os.Stat(event.Name); err == nil && info.IsDir() {
					_ = addMonitorDirectories(watcher, event.Name)
					continue
				}
			}
			if event.Op&(fsnotify.Create|fsnotify.Write|fsnotify.Rename) != 0 && validExts[strings.ToLower(filepath.Ext(event.Name))] {
				pending[filepath.Clean(event.Name)] = struct{}{}
				scheduleFlush()
			}
		case <-timerC:
			flush()
			timerC = nil
		case err, ok := <-watcher.Errors:
			if !ok {
				return
			}
			broadcastProgress("automation", gin.H{"id": task.ID, "kind": "monitor", "status": "目录监控异常：" + err.Error()})
		}
	}
}

func runAutomationTask(task AutomationTask, selectedPaths []string) {
	response, ok := automationTaskResponse(task)
	if !ok {
		return
	}
	workflow := response.Workflow
	workflow.SelectedPaths = selectedPaths
	if len(selectedPaths) > 0 {
		broadcastProgress("automation", gin.H{"id": task.ID, "kind": "monitor", "newFiles": len(selectedPaths), "status": "检测到新增歌曲，开始「" + task.Name + "」"})
	}
	if !startManagedJob("workflow", func() {
		start := time.Now()
		runWorkflow(workflow)
		db.Model(&AutomationTask{}).Where("id = ?", task.ID).Update("last_run", start)
	}, func(err error) {
		broadcastProgress("workflow", gin.H{"isRunning": false, "stage": "failed", "status": err.Error()})
	}) {
		broadcastProgress("automation", gin.H{"id": task.ID, "status": "已有工作流运行，本次触发已跳过"})
	}
}
