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
	
	// Ensure data directory exists
	os.MkdirAll("data", 0755)
	
	db, err = gorm.Open(sqlite.Open("data/songs.db"), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		log.Fatal("failed to connect database")
	}

	// Performance optimization: WAL mode
	sqlDB, _ := db.DB()
	sqlDB.Exec("PRAGMA journal_mode=WAL;")
	sqlDB.Exec("PRAGMA synchronous=NORMAL;")
	sqlDB.Exec("PRAGMA cache_size=-64000;") // 64MB cache

	db.AutoMigrate(&SongFile{})

	r := gin.Default()
	r.Use(cors.Default())

	// Define API routes FIRST
	api := r.Group("/api")
	{
		api.POST("/scan", apiStartScan)
		api.GET("/scan/progress", apiScanProgress)
		api.POST("/analyze", apiStartAnalyze)
		api.GET("/analyze/progress", apiAnalyzeProgress)
		api.GET("/groups", apiGetGroups)
		api.POST("/delete", apiDeleteGroup)
		api.POST("/auto-delete", apiAutoDelete) // Step 3 only
		api.GET("/auto-delete/progress", apiAutoDeleteProgress)
		api.POST("/full-pipeline", apiFullPipeline) // Step 1+2+3
		api.GET("/pipeline/progress", apiPipelineProgress)
	}

	// Serve static files via NoRoute to avoid conflict with /api
	r.NoRoute(func(c *gin.Context) {
		path := c.Request.URL.Path
		// Check if it's a file in static
		fpath := "static" + path
		if _, err := os.Stat(fpath); err == nil && !os.IsPathSeparator(path[len(path)-1]) {
			c.File(fpath)
			return
		}
		// Otherwise serve index.html for SPA
		c.File("static/index.html")
	})

	log.Println("Server starting on :8080")
	r.Run(":8080")
}
