package config

import (
	"os"
	"strconv"
	"time"
)

// Config aggregates runtime settings loaded from environment variables to mirror
// the existing Node.js server defaults.
type Config struct {
	HTTPPort        string
	PGHost          string
	PGPort          string
	PGDatabase      string
	PGUser          string
	PGPassword      string
	PGSSL           bool
	JWTSecret       string
	TokenTTL        time.Duration
	AdminToken      string
	MaintenanceFlag string
}

// Load builds a Config using the same env variable names as the legacy server.
func Load() Config {
	ttl := 30 * 24 * time.Hour
	if raw := os.Getenv("JWT_TTL"); raw != "" {
		if days, err := strconv.Atoi(raw); err == nil {
			ttl = time.Duration(days) * 24 * time.Hour
		}
	}

	sslEnabled := os.Getenv("PG_SSL") == "true"

	return Config{
		HTTPPort:        firstNonEmpty(os.Getenv("PORT"), "3000"),
		PGHost:          firstNonEmpty(os.Getenv("PG_HOST"), "localhost"),
		PGPort:          firstNonEmpty(os.Getenv("PG_PORT"), "5432"),
		PGDatabase:      firstNonEmpty(os.Getenv("PG_DATABASE"), "kocmoc"),
		PGUser:          firstNonEmpty(os.Getenv("PG_USER"), "kocmoc_user"),
		PGPassword:      os.Getenv("PG_PASSWORD"),
		PGSSL:           sslEnabled,
		JWTSecret:       firstNonEmpty(os.Getenv("JWT_SECRET"), "your-secret-key-change-in-production"),
		TokenTTL:        ttl,
		AdminToken:      os.Getenv("ADMIN_TOKEN"),
		MaintenanceFlag: firstNonEmpty(os.Getenv("MAINTENANCE_FLAG"), "maintenance.flag"),
	}
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}
