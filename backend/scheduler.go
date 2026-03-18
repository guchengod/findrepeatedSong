package main

import (
	"log"
	"time"

	"github.com/robfig/cron/v3"
)

var (
	cronRunner *cron.Cron
	entryMap   = make(map[uint]cron.EntryID)
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
		log.Printf("Executing task: %s\n", task.Name)
		
		// Run task based on name
		switch task.Name {
		case "organize":
			// We need a path from config
			var conf AppConfig
			db.Where("key = ?", "target_path").First(&conf)
			if conf.Value != "" {
				doOrganize(conf.Value, "move") // Default to move in auto
			}
		case "complete":
			doComplete()
		}

		// Update last run
		db.Model(&task).Updates(map[string]interface{}{
			"last_run": time.Now(),
		})
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
