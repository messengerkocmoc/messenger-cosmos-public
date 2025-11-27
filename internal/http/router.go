package http

import (
	"github.com/gin-gonic/gin"

	"github.com/messenger-cosmos-public/internal/config"
	"github.com/messenger-cosmos-public/internal/http/middleware"
)

type RouterDeps struct {
	Placeholder *PlaceholderHandler
	AuthMW      *middleware.Auth
	Config      config.Config
}

// NewRouter wires Gin with legacy-compatible middleware and placeholders.
func NewRouter(deps RouterDeps) *gin.Engine {
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(middleware.RequestID())
	if deps.Config.MaintenanceFlag != "" {
		r.Use(middleware.Maintenance(deps.Config.MaintenanceFlag))
	}

	api := r.Group("/api")
	registerAuthRoutes(api.Group("/auth"), deps)
	registerUserRoutes(api.Group("/users"), deps)
	registerContactRoutes(api.Group("/contacts"), deps)
	registerChatRoutes(api.Group("/chats"), deps)
	registerMessageRoutes(api.Group("/messages"), deps)
	registerFileRoutes(api.Group("/files"), deps)

	r.POST("/admin/toggle-maintenance", deps.Placeholder.NotImplemented)
	r.GET("/health", func(ctx *gin.Context) { ctx.JSON(200, gin.H{"status": "ok"}) })

	return r
}

func registerAuthRoutes(r *gin.RouterGroup, deps RouterDeps) {
	r.POST("/register", deps.Placeholder.NotImplemented)
	r.POST("/verify-email", deps.Placeholder.NotImplemented)
	r.POST("/resend-code", deps.Placeholder.NotImplemented)
	r.POST("/login", deps.Placeholder.NotImplemented)
	r.POST("/logout", deps.Placeholder.NotImplemented)
	r.GET("/verify", deps.Placeholder.NotImplemented)
	r.GET("/accounts/:deviceId", deps.Placeholder.NotImplemented)
}

func registerUserRoutes(r *gin.RouterGroup, deps RouterDeps) {
	r.Use(deps.AuthMW.Middleware())
	r.GET("/", deps.Placeholder.NotImplemented)
	r.GET("/:id", deps.Placeholder.NotImplemented)
	r.PUT("/:id", deps.Placeholder.NotImplemented)
	r.GET("/admin/stats", deps.Placeholder.NotImplemented)
	r.GET("/admin/devices", deps.Placeholder.NotImplemented)
	r.PUT("/admin/devices/:deviceId/reset", deps.Placeholder.NotImplemented)
	r.PUT("/:id/ban", deps.Placeholder.NotImplemented)
	r.PUT("/:id/unban", deps.Placeholder.NotImplemented)
	r.DELETE("/:id", deps.Placeholder.NotImplemented)
	r.GET("/search/:query", deps.Placeholder.NotImplemented)
}

func registerContactRoutes(r *gin.RouterGroup, deps RouterDeps) {
	r.Use(deps.AuthMW.Middleware())
	r.GET("/", deps.Placeholder.NotImplemented)
	r.POST("/add", deps.Placeholder.NotImplemented)
	r.POST("/remove", deps.Placeholder.NotImplemented)
}

func registerChatRoutes(r *gin.RouterGroup, deps RouterDeps) {
	r.Use(deps.AuthMW.Middleware())
	r.GET("/", deps.Placeholder.NotImplemented)
	r.POST("/", deps.Placeholder.NotImplemented)
	r.GET("/:id", deps.Placeholder.NotImplemented)
	r.PUT("/:id", deps.Placeholder.NotImplemented)
	r.DELETE("/:id", deps.Placeholder.NotImplemented)
}

func registerMessageRoutes(r *gin.RouterGroup, deps RouterDeps) {
	r.Use(deps.AuthMW.Middleware())
	r.GET("/:chatId", deps.Placeholder.NotImplemented)
	r.POST("/:chatId", deps.Placeholder.NotImplemented)
	r.POST("/:messageId/react", deps.Placeholder.NotImplemented)
	r.DELETE("/:messageId/react", deps.Placeholder.NotImplemented)
	r.PUT("/:chatId/read", deps.Placeholder.NotImplemented)
	r.DELETE("/:id", deps.Placeholder.NotImplemented)
	r.GET("/:chatId/search", deps.Placeholder.NotImplemented)
}

func registerFileRoutes(r *gin.RouterGroup, deps RouterDeps) {
	r.POST("/upload", deps.Placeholder.NotImplemented)
	r.GET("/:fileId", deps.Placeholder.NotImplemented)
	r.DELETE("/:fileId", deps.Placeholder.NotImplemented)
}
