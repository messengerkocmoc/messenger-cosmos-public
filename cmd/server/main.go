package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"

	"github.com/gin-gonic/gin"

	"github.com/messenger-cosmos-public/internal/auth"
	"github.com/messenger-cosmos-public/internal/config"
	legacydb "github.com/messenger-cosmos-public/internal/db"
	legacyhttp "github.com/messenger-cosmos-public/internal/http"
	"github.com/messenger-cosmos-public/internal/http/middleware"
)

func main() {
	cfg := config.Load()
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	pool, err := legacydb.NewPool(ctx, cfg)
	if err != nil {
		log.Fatalf("db connect: %v", err)
	}
	if err := legacydb.ApplyMigrations(ctx, pool, filepath.Join("internal", "db", "migrations")); err != nil {
		log.Fatalf("apply migrations: %v", err)
	}

	authSvc := auth.NewService(cfg.JWTSecret, cfg.TokenTTL, pool)
	authMW := middleware.NewAuth(authSvc)

	router := legacyhttp.NewRouter(legacyhttp.RouterDeps{
		Placeholder: legacyhttp.NewPlaceholderHandler(),
		AuthMW:      authMW,
		Config:      cfg,
	})

	// Static assets mimic Express config
	router.Static("/uploads", filepath.Join("uploads"))
	router.Static("/", filepath.Join("public"))

	srv := &http.Server{Addr: ":" + cfg.HTTPPort, Handler: router}
	go func() {
		log.Printf("kocmoc Go server listening on %s", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %v", err)
		}
	}()

	<-ctx.Done()
	stop()
	log.Println("shutting down...")
	_ = srv.Shutdown(context.Background())
}

// ensure gin uses release mode in production
func init() {
	if os.Getenv("GIN_MODE") == "" {
		gin.SetMode(gin.ReleaseMode)
	}
}
