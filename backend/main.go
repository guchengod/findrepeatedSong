package main

import (
	"log"
	"os"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var db *gorm.DB

func main() {
	var err error
	os.MkdirAll("data", 0755)
	db, err = gorm.Open(sqlite.Open("data/songs.db"), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		log.Fatal(err)
	}

	db.AutoMigrate(&SongFile{}, &AppConfig{}, &ScheduleTask{})

	// Seed default data
	seedData()

	// Initialize Scheduler
	initScheduler()

	r := gin.Default()
	r.Use(cors.Default())

	api := r.Group("/api")
	{
		// Deduper
		api.POST("/scan", apiStartScan)
		api.GET("/scan/progress", apiScanProgress)
		api.POST("/analyze", apiStartAnalyze)
		api.GET("/analyze/progress", apiAnalyzeProgress)
		api.GET("/groups", apiGetGroups)
		api.POST("/delete", apiDeleteGroup)
		api.POST("/delete-file", apiDeleteFile)
		api.POST("/auto-delete", apiAutoDelete)
		api.GET("/auto-delete/progress", apiAutoDeleteProgress)
		api.POST("/full-pipeline", apiFullPipeline)
		api.GET("/pipeline/progress", apiPipelineProgress)

		// Organizer
		api.POST("/organize", apiStartOrganize)
		api.GET("/organize/status", apiOrganizeStatus)

		// Completer
		api.POST("/complete", apiStartComplete)
		api.GET("/complete/status", apiCompleteStatus)

		// Schedules
		api.GET("/schedules", apiGetSchedules)
		api.POST("/schedules", apiUpdateSchedule)

		// Config
		api.GET("/config", apiGetConfig)
		api.POST("/config", apiUpdateConfig)
	}

	r.NoRoute(func(c *gin.Context) {
		path := c.Request.URL.Path
		fpath := "static" + path
		if _, err := os.Stat(fpath); err == nil && !os.IsPathSeparator(path[len(path)-1]) {
			c.File(fpath)
			return
		}
		c.File("static/index.html")
	})

	log.Println("Server starting on :8080")
	r.Run(":8080")
}

func seedData() {
	configs := []AppConfig{
		{Key: "source_path", Value: "", Desc: "Default source path for music"},
		{Key: "target_path", Value: "", Desc: "Default target path for organization"},
		{Key: "mb_user_agent", Value: "FindRepeatedSong/1.0.0", Desc: "User-Agent for MusicBrainz API"},
		{Key: "default_delete_strategy", Value: "quality,size_desc", Desc: "Default deletion strategy (comma separated: quality, size_desc, size_asc)"},
		{Key: "scan_depth", Value: "10", Desc: "Maximum directory depth for scanning (default: 10)"},
	}
	for _, c := range configs {
		db.Where("key = ?", c.Key).FirstOrCreate(&c)
	}

	tasks := []ScheduleTask{
		{Name: "organize", Cron: "0 2 * * *", IsActive: false},
		{Name: "complete", Cron: "0 3 * * *", IsActive: false},
	}
	for _, t := range tasks {
		db.Where("name = ?", t.Name).FirstOrCreate(&t)
	}
}
