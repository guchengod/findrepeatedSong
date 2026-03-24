package main

import (
	"log"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/robfig/cron/v3"
)

var (
	cronRunner *cron.Cron
	entryMap   = make(map[uint]cron.EntryID)
	activeJobs int
	activeMu   sync.Mutex
)

func initScheduler() {
	cronRunner = cron.New()
	cronRunner.Start()

	// Load all active tasks from DB
	var tasks []ScheduleTask
	db.Where("is_active = ?", true).Find(&tasks)

	for _, task := range tasks {
		addTask(task)
	}
}

func addTask(task ScheduleTask) {
	id, err := cronRunner.AddFunc(task.Cron, func() {
		log.Printf("Executing scheduled task: %s\n", task.Name)

		start := time.Now()
		status := "COMPLETE"
		var errMsg *string

		// Increment active jobs counter
		activeMu.Lock()
		activeJobs++
		activeMu.Unlock()

		broadcastProgress("scheduler", gin.H{"isRunning": true, "task": task.Name, "status": "running"})

		// Run task based on name
		switch task.Name {
		case "organize":
			var conf AppConfig
			db.Where("key = ?", "target_path").First(&conf)
			if conf.Value != "" {
				doOrganize(conf.Value, "move")
			}
		case "complete":
			var conf AppConfig
			db.Where("key = ?", "source_path").First(&conf)
			if conf.Value != "" {
				doComplete(conf.Value)
			}
		}

		// Decrement active jobs counter
		activeMu.Lock()
		activeJobs--
		activeMu.Unlock()

		durationMs := time.Since(start).Milliseconds()
		runRecord := RunRecord{
			ID:        GenerateRunID(task.Name),
			Timestamp: start,
			Status:    status,
			Duration:  durationMs,
			Error:     errMsg,
		}

		// Reload task from DB to get current RunHistory, then append and save
		var updatedTask ScheduleTask
		db.First(&updatedTask, task.ID)
		updatedTask.AddRunRecord(runRecord)
		db.Model(&updatedTask).Updates(map[string]interface{}{
			"last_run":    start,
			"run_history": updatedTask.RunHistory,
		})

		broadcastProgress("scheduler", gin.H{"isRunning": false, "task": task.Name, "status": status})
	})

	if err == nil {
		entryMap[task.ID] = id
	} else {
		log.Printf("Error adding task %s: %v\n", task.Name, err)
	}
}

func removeTask(taskID uint) {
	if entryID, ok := entryMap[taskID]; ok {
		cronRunner.Remove(entryID)
		delete(entryMap, taskID)
	}
}

func updateTask(task ScheduleTask) {
	removeTask(task.ID)
	if task.IsActive {
		addTask(task)
	}
}

// GetActiveJobs returns the current number of running scheduled jobs.
func GetActiveJobs() int {
	activeMu.Lock()
	defer activeMu.Unlock()
	return activeJobs
}
