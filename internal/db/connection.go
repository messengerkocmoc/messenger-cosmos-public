package db

import (
	"context"
	"crypto/tls"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/messenger-cosmos-public/internal/config"
)

func NewPool(ctx context.Context, cfg config.Config) (*pgxpool.Pool, error) {
	dsn := fmt.Sprintf("postgres://%s:%s@%s:%s/%s", cfg.PGUser, cfg.PGPassword, cfg.PGHost, cfg.PGPort, cfg.PGDatabase)
	poolConfig, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, err
	}

	if cfg.PGSSL {
		poolConfig.ConnConfig.TLSConfig = &tls.Config{InsecureSkipVerify: true}
	}

	return pgxpool.NewWithConfig(ctx, poolConfig)
}
