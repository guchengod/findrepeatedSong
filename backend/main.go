package main

import (
	"log"
	"os"
	"path/filepath"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var db *gorm.DB

func main() {
	var err error
	dataDir := envOrDefault("FINDREPEATEDSONG_DATA_DIR", "data")
	staticDir := envOrDefault("FINDREPEATEDSONG_STATIC_DIR", "static")
	port := envOrDefault("FINDREPEATEDSONG_PORT", "38491")

	if err := os.MkdirAll(dataDir, 0755); err != nil {
		log.Fatal(err)
	}
	db, err = gorm.Open(sqlite.Open(filepath.Join(dataDir, "songs.db")), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		log.Fatal(err)
	}

	db.AutoMigrate(&SongFile{}, &AppConfig{}, &ScheduleTask{})

	// Seed default data
	seedData()

	// Pre-warm stats cache
	RefreshStats()

	// Initialize Scheduler
	initScheduler()
	go hub.run()

	r := gin.Default()
	r.Use(cors.Default())

	api := r.Group("/api")
	{
		// Deduper
		api.POST("/scan", apiStartScan)
		api.POST("/analyze", apiStartAnalyze)
		api.GET("/groups", apiGetGroups)
		api.POST("/delete", apiDeleteGroup)
		api.POST("/delete-file", apiDeleteFile)
		api.POST("/auto-delete", apiAutoDelete)
		api.POST("/full-pipeline", apiFullPipeline)

		// Organizer
		api.POST("/organize", apiStartOrganize)

		// Completer
		api.POST("/complete", apiStartComplete)

		// Schedules
		api.GET("/schedules", apiGetSchedules)
		api.POST("/schedules", apiUpdateSchedule)

		// Config
		api.GET("/config", apiGetConfig)
		api.POST("/config", apiUpdateConfig)

		// Stats
		api.GET("/stats", apiGetStats)

		// Browse
		api.GET("/browse-path", apiBrowsePath)
	}

	r.GET("/ws", serveWsGin)

	r.NoRoute(func(c *gin.Context) {
		path := c.Request.URL.Path
		fpath := filepath.Join(staticDir, path)
		if _, err := os.Stat(fpath); err == nil && !os.IsPathSeparator(path[len(path)-1]) {
			c.File(fpath)
			return
		}
		c.File(filepath.Join(staticDir, "index.html"))
	})

	log.Printf("Server starting on :%s", port)
	r.Run(":" + port)
}

func envOrDefault(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
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
