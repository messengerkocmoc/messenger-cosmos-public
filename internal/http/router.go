package http

import (
	"github.com/gin-gonic/gin"

	"github.com/messenger-cosmos-public/internal/config"
	"github.com/messenger-cosmos-public/internal/http/middleware"
)

type RouterDeps struct {
	Handler *Handler
	AuthMW  *middleware.Auth
	Config  config.Config
}

// NewRouter wires Gin with legacy-compatible middleware and handlers.
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

	r.POST("/admin/toggle-maintenance", deps.Handler.ToggleMaintenance)
	r.GET("/health", func(ctx *gin.Context) { ctx.JSON(200, gin.H{"status": "ok"}) })

	return r
}

func registerAuthRoutes(r *gin.RouterGroup, deps RouterDeps) {
	r.POST("/register", deps.Handler.Register)
	r.POST("/verify-email", deps.Handler.VerifyEmail)
	r.POST("/resend-code", deps.Handler.ResendCode)
	r.POST("/login", deps.Handler.Login)
	r.POST("/logout", deps.Handler.Logout)
	r.GET("/verify", deps.Handler.VerifyToken)
	r.GET("/accounts/:deviceId", deps.Handler.AccountsByDevice)
}

func registerUserRoutes(r *gin.RouterGroup, deps RouterDeps) {
	r.Use(deps.AuthMW.Middleware())
	r.GET("/", deps.Handler.ListUsers)
	r.GET("/:id", deps.Handler.GetUser)
	r.PUT("/:id", deps.Handler.UpdateUser)
	r.GET("/admin/stats", deps.Handler.AdminStats)
	r.GET("/admin/devices", deps.Handler.AdminDevices)
	r.PUT("/admin/devices/:deviceId/reset", deps.Handler.ResetDevice)
	r.PUT("/:id/ban", deps.Handler.BanUser)
	r.PUT("/:id/unban", deps.Handler.UnbanUser)
	r.DELETE("/:id", deps.Handler.DeleteUser)
	r.GET("/search/:query", deps.Handler.SearchUsers)
}

func registerContactRoutes(r *gin.RouterGroup, deps RouterDeps) {
	r.Use(deps.AuthMW.Middleware())
	r.GET("/", deps.Handler.ListContacts)
	r.POST("/add", deps.Handler.AddContact)
	r.POST("/remove", deps.Handler.RemoveContact)
}

func registerChatRoutes(r *gin.RouterGroup, deps RouterDeps) {
	r.Use(deps.AuthMW.Middleware())
	r.GET("/", deps.Handler.ListChats)
	r.POST("/", deps.Handler.CreateChat)
	r.GET("/:id", deps.Handler.GetChat)
	r.PUT("/:id", deps.Handler.UpdateChat)
	r.DELETE("/:id", deps.Handler.DeleteChat)
}

func registerMessageRoutes(r *gin.RouterGroup, deps RouterDeps) {
	r.Use(deps.AuthMW.Middleware())
	r.GET("/:chatId", deps.Handler.ListMessages)
	r.POST("/:chatId", deps.Handler.SendMessage)
	r.POST("/:messageId/react", deps.Handler.ReactMessage)
	r.DELETE("/:messageId/react", deps.Handler.RemoveReaction)
	r.PUT("/:chatId/read", deps.Handler.MarkRead)
	r.DELETE("/:id", deps.Handler.DeleteMessage)
	r.GET("/:chatId/search", deps.Handler.SearchMessages)
}

func registerFileRoutes(r *gin.RouterGroup, deps RouterDeps) {
	r.POST("/upload", deps.Handler.UploadFile)
	r.GET("/:fileId", deps.Handler.GetFile)
	r.DELETE("/:fileId", deps.Handler.DeleteFile)
}
